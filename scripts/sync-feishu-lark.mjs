import { resolveSyncTarget } from "./lib/config.mjs";
import { runLarkCliJson } from "./lib/lark-cli.mjs";
import { loadOrFetchPromptPayload } from "./lib/prompt-source.mjs";
import { chunk, normalizePromptToRow, rowToValues } from "./lib/prompt-utils.mjs";
import { FIELD_ORDER, LOOKUP_FIELDS } from "./lib/schema.mjs";

function listAllExistingRecords(baseToken, tableId) {
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
      String(offset),
      "--field-id",
      LOOKUP_FIELDS[0],
      "--field-id",
      LOOKUP_FIELDS[1],
      "--field-id",
      LOOKUP_FIELDS[2]
    ]);

    const data = response.data;

    for (let index = 0; index < data.record_id_list.length; index += 1) {
      const row = data.data[index] || [];
      const promptId = row[0] ? String(row[0]) : "";

      if (!promptId) {
        continue;
      }

      records.set(promptId, {
        recordId: data.record_id_list[index],
        contentHash: row[1] ? String(row[1]) : "",
        active: Boolean(row[2])
      });
    }

    if (!data.has_more) {
      break;
    }

    offset += 100;
  }

  return records;
}

function batchCreateWithLark(baseToken, tableId, rows) {
  for (const group of chunk(rows, 100)) {
    runLarkCliJson([
      "base",
      "+record-batch-create",
      "--base-token",
      baseToken,
      "--table-id",
      tableId,
      "--json",
      JSON.stringify({
        fields: FIELD_ORDER,
        rows: group.map((row) => rowToValues(row, FIELD_ORDER))
      })
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
  const existing = listAllExistingRecords(target.baseToken, target.tableId);

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
