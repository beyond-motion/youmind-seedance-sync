import { resolveSyncTarget } from "./lib/config.mjs";
import { runLarkCliJson } from "./lib/lark-cli.mjs";
import { loadOrFetchPromptPayload } from "./lib/prompt-source.mjs";
import { normalizePromptToRow } from "./lib/prompt-utils.mjs";
import { LOOKUP_FIELDS } from "./lib/schema.mjs";

const DEFAULT_RECORD_PAGE_LIMIT = 50;
const MIN_RECORD_PAGE_LIMIT = 20;
const DEFAULT_PAGE_RETRY_COUNT = 2;
const DEFAULT_PAGE_RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isRetryableFeishuListError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes('"code": 5000') ||
    message.includes("[5000]") ||
    message.includes("api_error") ||
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("internal server error") ||
    message.includes("bad gateway") ||
    message.includes("service unavailable") ||
    message.includes("gateway timeout")
  );
}

function resolveLookupIndexes(fields) {
  const indexes = new Map(fields.map((field, index) => [String(field), index]));
  const promptIdIndex = indexes.get(LOOKUP_FIELDS[0]);
  const contentHashIndex = indexes.get(LOOKUP_FIELDS[1]);
  const activeIndex = indexes.get(LOOKUP_FIELDS[2]);

  if (
    !Number.isInteger(promptIdIndex) ||
    !Number.isInteger(contentHashIndex) ||
    !Number.isInteger(activeIndex)
  ) {
    throw new Error(
      `Required lookup fields are missing from lark-cli response. fields=${JSON.stringify(fields)}`
    );
  }

  return {
    promptIdIndex,
    contentHashIndex,
    activeIndex
  };
}

async function fetchRecordPage(baseToken, tableId, offset, limit) {
  const retries = getPositiveIntEnv("LARK_SYNC_LIST_PAGE_RETRIES", DEFAULT_PAGE_RETRY_COUNT);
  const baseDelayMs = getPositiveIntEnv(
    "LARK_SYNC_LIST_PAGE_RETRY_DELAY_MS",
    DEFAULT_PAGE_RETRY_DELAY_MS
  );
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return runLarkCliJson([
        "base",
        "+record-list",
        "--base-token",
        baseToken,
        "--table-id",
        tableId,
        "--limit",
        String(limit),
        "--offset",
        String(offset)
      ]);
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !isRetryableFeishuListError(error)) {
        break;
      }

      const delayMs = baseDelayMs * 2 ** attempt;
      console.warn(
        `Feishu record-list failed at offset=${offset} limit=${limit}. Retrying in ${delayMs}ms (${attempt + 1}/${retries}) ...`
      );
      await sleep(delayMs);
    }
  }

  if (limit > MIN_RECORD_PAGE_LIMIT) {
    const fallbackLimit = Math.max(MIN_RECORD_PAGE_LIMIT, Math.floor(limit / 2));
    console.warn(
      `Feishu record-list still failed at offset=${offset} with limit=${limit}. Falling back to smaller page size=${fallbackLimit}.`
    );
    return fetchRecordPage(baseToken, tableId, offset, fallbackLimit);
  }

  throw lastError;
}

async function listAllExistingRecords(baseToken, tableId) {
  const records = new Map();
  let offset = 0;
  let page = 1;
  const pageLimit = getPositiveIntEnv("LARK_SYNC_PAGE_LIMIT", DEFAULT_RECORD_PAGE_LIMIT);

  while (true) {
    const response = await fetchRecordPage(baseToken, tableId, offset, pageLimit);
    const data = response.data;
    const { promptIdIndex, contentHashIndex, activeIndex } = resolveLookupIndexes(data.fields || []);
    const rows = Array.isArray(data.data) ? data.data : [];
    const recordIds = Array.isArray(data.record_id_list) ? data.record_id_list : [];

    for (let index = 0; index < recordIds.length; index += 1) {
      const row = rows[index] || [];
      const promptId = row[promptIdIndex] ? String(row[promptIdIndex]) : "";

      if (!promptId) {
        continue;
      }

      records.set(promptId, {
        recordId: recordIds[index],
        contentHash: row[contentHashIndex] ? String(row[contentHashIndex]) : "",
        active: Boolean(row[activeIndex])
      });
    }

    console.log(`  loaded Feishu page=${page} rows=${rows.length} offset=${offset}`);

    if (!data.has_more) {
      break;
    }

    offset += rows.length > 0 ? rows.length : pageLimit;
    page += 1;
  }

  return records;
}

function batchCreateWithLark(baseToken, tableId, rows) {
  for (const row of rows) {
    runLarkCliJson([
      "base",
      "+record-upsert",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--json",
      JSON.stringify(row)
    ]);
  }
}

function batchUpdateWithLark(baseToken, tableId, updates) {
  for (const entry of updates) {
    runLarkCliJson([
      "base",
      "+record-upsert",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--record-id",
      entry.recordId,
      "--json",
      JSON.stringify(entry.fields)
    ]);
  }
}

async function main() {
  const target = resolveSyncTarget();
  const syncedAt = new Date().toISOString();
  const { payload, source } = await loadOrFetchPromptPayload({
    locale: target.locale,
    model: target.model,
    forceRefresh: process.env.YOUMIND_FORCE_REFRESH === "1",
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

  console.log("Loading existing Feishu records ...");
  const existing = await listAllExistingRecords(target.baseToken, target.tableId);

  const desiredRows = payload.prompts.map((prompt) =>
    normalizePromptToRow(prompt, {
      locale: target.locale,
      model: target.model,
      syncedAt,
      active: true
    })
  );

  const desiredIds = new Set(desiredRows.map((row) => row["Prompt ID"]));
  const creates = [];
  const updates = [];
  const deactivations = [];

  for (const row of desiredRows) {
    const promptId = row["Prompt ID"];
    const current = existing.get(promptId);

    if (!current) {
      creates.push(row);
      continue;
    }

    if (current.contentHash !== row["Content Hash"] || current.active !== true) {
      updates.push({
        recordId: current.recordId,
        fields: row
      });
    }
  }

  for (const [promptId, current] of existing.entries()) {
    if (!desiredIds.has(promptId) && current.active) {
      deactivations.push({
        recordId: current.recordId,
        fields: {
          Active: false
        }
      });
    }
  }

  console.log(
    `Sync plan: create=${creates.length} update=${updates.length} deactivate=${deactivations.length}`
  );

  if (creates.length > 0) {
    console.log("Creating new records ...");
    batchCreateWithLark(target.baseToken, target.tableId, creates);
  }

  if (updates.length > 0) {
    console.log("Updating changed records ...");
    batchUpdateWithLark(target.baseToken, target.tableId, updates);
  }

  if (deactivations.length > 0) {
    console.log("Marking stale records inactive ...");
    batchUpdateWithLark(target.baseToken, target.tableId, deactivations);
  }

  console.log(
    `Finished. total=${payload.prompts.length} created=${creates.length} updated=${updates.length} inactive=${deactivations.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
