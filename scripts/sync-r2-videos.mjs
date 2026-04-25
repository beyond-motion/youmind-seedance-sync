import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { resolveR2Config, resolveSyncTarget } from "./lib/config.mjs";
import { runLarkCliJson, runLarkCliJsonAsync } from "./lib/lark-cli.mjs";
import { loadOrFetchPromptPayload } from "./lib/prompt-source.mjs";
import { extractOriginalVideoUrl, rowValuesToObject } from "./lib/prompt-utils.mjs";
import { MIRROR_FIELD_DEFINITIONS } from "./lib/schema.mjs";
import {
  buildMirrorObjectKey,
  buildMirrorVideoUrl,
  getMirrorRecord,
  loadMirrorManifest,
  writeMirrorManifest
} from "./lib/video-source.mjs";
import {
  ensureWranglerAuthenticated,
  getR2DevUrl,
  uploadFileToR2
} from "./lib/wrangler-cli.mjs";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isR2RateLimitError(error) {
  const message = String(error?.message || "");
  return message.includes("10429") || message.includes("429: Too Many Requests");
}

function isR2TransientUploadError(error) {
  const message = String(error?.message || "");
  return (
    isR2RateLimitError(error) ||
    message.includes("401: Unauthorized") ||
    message.includes("Authentication error") ||
    message.includes("fetch failed") ||
    message.includes("502: Bad Gateway") ||
    message.includes("503: Service Unavailable") ||
    message.includes("504: Gateway Timeout")
  );
}

function isWranglerAuthError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Not logged in") ||
    message.includes("Invalid access token") ||
    message.includes("Max auth failures reached") ||
    message.includes("[code: 9109]")
  );
}

async function uploadFileToR2WithRetry({
  bucketName,
  objectKey,
  filePath,
  contentType,
  maxAttempts,
  baseDelayMs
}) {
  let attempt = 1;

  while (true) {
    try {
      await uploadFileToR2({
        bucketName,
        objectKey,
        filePath,
        contentType
      });
      return;
    } catch (error) {
      if (isWranglerAuthError(error)) {
        throw new Error(
          `Cloudflare authentication failed while uploading ${objectKey}. Run 'npx wrangler login' again or set CLOUDFLARE_API_TOKEN before retrying.\n${String(error.message || error)}`
        );
      }

      if (!isR2TransientUploadError(error) || attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `R2 transient upload error for ${objectKey}. Retrying in ${Math.round(delayMs / 1000)}s (${attempt}/${maxAttempts - 1}) ...`
      );
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

function listMirrorFields(baseToken, tableId) {
  const response = runLarkCliJson([
    "base",
    "+field-list",
    "--base-token",
    baseToken,
    "--table-id",
    tableId
  ]);

  return Array.isArray(response?.data?.fields) ? response.data.fields : [];
}

function ensureMirrorFields(baseToken, tableId) {
  const existingFieldNames = new Set(listMirrorFields(baseToken, tableId).map((field) => field.name));

  for (const field of MIRROR_FIELD_DEFINITIONS) {
    if (existingFieldNames.has(field.name)) {
      continue;
    }

    console.log(`Creating Feishu mirror field: ${field.name}`);
    runLarkCliJson([
      "base",
      "+field-create",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--json",
      JSON.stringify(field)
    ]);
  }
}

function listExistingRecords(baseToken, tableId) {
  const records = new Map();
  let offset = 0;

  while (true) {
    const response = runLarkCliJson([
      "base",
      "+record-list",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--limit",
      "100",
      "--offset",
      String(offset)
    ]);
    const data = response.data || {};
    const fieldOrder = Array.isArray(data.fields) ? data.fields : [];
    const recordIds = Array.isArray(data.record_id_list) ? data.record_id_list : [];
    const rows = Array.isArray(data.data) ? data.data : [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rowValuesToObject(rows[index] || [], fieldOrder);
      const promptId = String(row["Prompt ID"] || "").trim();

      if (!promptId) {
        continue;
      }

      records.set(promptId, {
        recordId: recordIds[index],
        row
      });
    }

    if (!data.has_more) {
      break;
    }

    offset += rows.length > 0 ? rows.length : 100;
  }

  return records;
}

function updateRecordAsync(baseToken, tableId, recordId, fields) {
  return runLarkCliJsonAsync([
    "base",
    "+record-upsert",
    "--base-token",
    baseToken,
    "--table-id",
    tableId,
    "--record-id",
    recordId,
    "--json",
    JSON.stringify(fields)
  ]);
}

function isFeishuTransientUpdateError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("EOF") ||
    message.includes("fetch failed") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNRESET") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

async function updateRecordWithRetry({
  baseToken,
  tableId,
  recordId,
  fields,
  maxAttempts,
  baseDelayMs
}) {
  let attempt = 1;

  while (true) {
    try {
      await updateRecordAsync(baseToken, tableId, recordId, fields);
      return;
    } catch (error) {
      if (!isFeishuTransientUpdateError(error) || attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `Feishu transient update error for record ${recordId}. Retrying in ${Math.round(delayMs / 1000)}s (${attempt}/${maxAttempts - 1}) ...`
      );
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

function getEnvNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function needsFeishuUpdate(currentRow, nextFields) {
  return Object.entries(nextFields).some(([fieldName, value]) => String(currentRow?.[fieldName] || "") !== String(value || ""));
}

function buildMirrorFields(result) {
  return {
    "Original Video URL": result.originalVideoUrl || "",
    "Mirror Video URL": result.mirrorVideoUrl || "",
    "Mirror Status": result.status || "",
    "Mirror Synced At": result.syncedAt || ""
  };
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const stream = Readable.fromWeb(response.body);
  const output = fs.createWriteStream(filePath);
  await finished(stream.pipe(output));

  return response.headers.get("content-type") || "video/mp4";
}

async function mapWithConcurrency(items, concurrency, iteratee) {
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += concurrency) {
      await iteratee(items[index], index);
    }
  });

  await Promise.all(workers);
}

async function main() {
  const target = resolveSyncTarget({ requireBase: false });
  const r2Config = resolveR2Config({ requireBucket: true });
  const forceUpload = process.env.R2_MIRROR_FORCE === "1";
  const syncLimit = getEnvNumber("R2_MIRROR_LIMIT", 0);
  const concurrency = getEnvNumber("R2_MIRROR_CONCURRENCY", 3);
  const feishuConcurrency = getEnvNumber("R2_MIRROR_FEISHU_CONCURRENCY", 6);
  const checkpointEvery = getEnvNumber("R2_MIRROR_CHECKPOINT_EVERY", 25);
  const uploadRetryAttempts = getEnvNumber("R2_MIRROR_UPLOAD_RETRY_ATTEMPTS", 5);
  const uploadRetryBaseDelayMs = getEnvNumber("R2_MIRROR_UPLOAD_RETRY_BASE_DELAY_MS", 5000);
  const feishuRetryAttempts = getEnvNumber("R2_MIRROR_FEISHU_RETRY_ATTEMPTS", 4);
  const feishuRetryBaseDelayMs = getEnvNumber("R2_MIRROR_FEISHU_RETRY_BASE_DELAY_MS", 3000);
  const shouldSyncFeishu = Boolean(target.baseToken) && Boolean(target.tableId);

  ensureWranglerAuthenticated();

  const publicUrlBase = r2Config.publicUrlBase || getR2DevUrl(r2Config.bucketName);
  const manifest = loadMirrorManifest(r2Config.manifestPath);

  const { payload, source } = await loadOrFetchPromptPayload({
    locale: target.locale,
    model: target.model,
    forceRefresh: process.env.YOUMIND_FORCE_REFRESH === "1",
    preferCache: true,
    allowStaleFallbackOnError: true,
    onProgress({ page, totalPages, fetched, total }) {
      console.log(`  page ${page}/${totalPages} fetched=${fetched}/${total}`);
    }
  });

  console.log(
    source === "cache"
      ? `Using cached prompts snapshot (${payload.prompts.length} rows)`
      : source === "stale-cache"
        ? `Using stale cached prompts snapshot after fetch failure (${payload.prompts.length} rows)`
        : `Fetched fresh prompts snapshot (${payload.prompts.length} rows)`
  );

  let existingRecords = new Map();

  if (shouldSyncFeishu) {
    ensureMirrorFields(target.baseToken, target.tableId);
    console.log("Loading existing Feishu records ...");
    existingRecords = listExistingRecords(target.baseToken, target.tableId);
  }

  const entries = payload.prompts
    .map((prompt) => {
      const originalVideoUrl = extractOriginalVideoUrl(prompt);

      if (!originalVideoUrl) {
        return null;
      }

      const objectKey = buildMirrorObjectKey({
        keyPrefix: r2Config.keyPrefix,
        locale: target.locale,
        promptId: prompt.id,
        videoUrl: originalVideoUrl
      });

      return {
        promptId: String(prompt.id),
        originalVideoUrl,
        objectKey,
        mirrorVideoUrl: buildMirrorVideoUrl(publicUrlBase, objectKey)
      };
    })
    .filter(Boolean);

  const selectedEntries = syncLimit > 0 ? entries.slice(0, syncLimit) : entries;
  const stats = {
    total: selectedEntries.length,
    uploaded: 0,
    skipped: 0,
    failed: 0,
    feishuUpdated: 0
  };
  const results = new Map();
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "youmind-r2-"));
  let completedCount = 0;
  let checkpointQueue = Promise.resolve();
  let authFailure = null;

  console.log(
    `Mirror plan: total=${selectedEntries.length} concurrency=${concurrency} feishu=${shouldSyncFeishu ? "yes" : "no"}`
  );

  function persistEntry(result) {
    manifest.items[result.promptId] = {
      promptId: result.promptId,
      locale: target.locale,
      objectKey: result.objectKey,
      originalVideoUrl: result.originalVideoUrl,
      mirrorVideoUrl: result.status === "synced" ? result.mirrorVideoUrl : "",
      status: result.status,
      syncedAt: result.syncedAt,
      error: result.error || ""
    };
  }

  function queueCheckpoint(label = "checkpoint") {
    checkpointQueue = checkpointQueue.then(() => {
      writeMirrorManifest(r2Config.manifestPath, manifest);
      console.log(`Mirror ${label}: completed=${completedCount}/${selectedEntries.length}`);
    });

    return checkpointQueue;
  }

  try {
    await mapWithConcurrency(selectedEntries, concurrency, async (entry, index) => {
      if (authFailure) {
        return;
      }

      const previous = getMirrorRecord(manifest, entry.promptId, entry.originalVideoUrl);
      const syncedAt = new Date().toISOString();

      if (
        !forceUpload &&
        previous?.status === "synced" &&
        previous.mirrorVideoUrl === entry.mirrorVideoUrl &&
        previous.originalVideoUrl === entry.originalVideoUrl
      ) {
        stats.skipped += 1;
        results.set(entry.promptId, {
          ...entry,
          status: "synced",
          syncedAt: previous.syncedAt || syncedAt
        });
        console.log(
          `[${index + 1}/${selectedEntries.length}] prompt=${entry.promptId} mirror already up to date`
        );
        persistEntry(results.get(entry.promptId));
        completedCount += 1;

        if (checkpointEvery > 0 && completedCount % checkpointEvery === 0) {
          await queueCheckpoint();
        }

        return;
      }

      const tempFilePath = path.join(tempDir, `${entry.promptId}${path.extname(entry.objectKey) || ".mp4"}`);

      try {
        const contentType = await downloadToFile(entry.originalVideoUrl, tempFilePath);
        await uploadFileToR2WithRetry({
          bucketName: r2Config.bucketName,
          objectKey: entry.objectKey,
          filePath: tempFilePath,
          contentType,
          maxAttempts: uploadRetryAttempts,
          baseDelayMs: uploadRetryBaseDelayMs
        });

        stats.uploaded += 1;
        results.set(entry.promptId, {
          ...entry,
          status: "synced",
          syncedAt
        });
        console.log(`[${index + 1}/${selectedEntries.length}] prompt=${entry.promptId} uploaded`);
      } catch (error) {
        if (isWranglerAuthError(error)) {
          authFailure = error;
        }

        stats.failed += 1;
        results.set(entry.promptId, {
          ...entry,
          status: "failed",
          syncedAt,
          error: error instanceof Error ? error.message : String(error)
        });
        console.warn(
          `[${index + 1}/${selectedEntries.length}] prompt=${entry.promptId} upload failed: ${results.get(entry.promptId).error}`
        );
      } finally {
        await fsp.rm(tempFilePath, { force: true });
      }

      persistEntry(results.get(entry.promptId));
      completedCount += 1;

      if (checkpointEvery > 0 && completedCount % checkpointEvery === 0) {
        await queueCheckpoint();
      }
    });
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }

  if (authFailure) {
    await checkpointQueue;
    writeMirrorManifest(r2Config.manifestPath, manifest);
    throw authFailure;
  }

  await checkpointQueue;
  writeMirrorManifest(r2Config.manifestPath, manifest);
  console.log(`Mirror manifest written to ${r2Config.manifestPath}`);

  if (shouldSyncFeishu) {
    console.log("Updating Feishu mirror fields ...");
    const pendingUpdates = [];

    for (const entry of selectedEntries) {
      const current = existingRecords.get(entry.promptId);

      if (!current?.recordId) {
        continue;
      }

      const result = manifest.items[entry.promptId];
      const fields = buildMirrorFields(result);

      if (!needsFeishuUpdate(current.row, fields)) {
        continue;
      }

      pendingUpdates.push({
        recordId: current.recordId,
        fields
      });
    }

    await mapWithConcurrency(pendingUpdates, feishuConcurrency, async (update) => {
      await updateRecordWithRetry({
        baseToken: target.baseToken,
        tableId: target.tableId,
        recordId: update.recordId,
        fields: update.fields,
        maxAttempts: feishuRetryAttempts,
        baseDelayMs: feishuRetryBaseDelayMs
      });
    });
    stats.feishuUpdated = pendingUpdates.length;
  }

  console.log(
    `Finished R2 mirror sync. total=${stats.total} uploaded=${stats.uploaded} skipped=${stats.skipped} failed=${stats.failed} feishuUpdated=${stats.feishuUpdated}`
  );
  console.log(`Public video base: ${publicUrlBase}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
