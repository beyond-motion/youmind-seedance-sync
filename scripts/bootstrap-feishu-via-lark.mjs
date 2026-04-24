import { resolveSyncTarget, writeLocalConfig } from "./lib/config.mjs";
import { runLarkCliJson } from "./lib/lark-cli.mjs";
import { FIELD_DEFINITIONS } from "./lib/schema.mjs";

async function main() {
  const config = resolveSyncTarget({ requireBase: false });
  const baseName = config.baseName || "YouMind Seedance 2.0 Prompts";

  console.log(`Creating base: ${baseName}`);
  const basePayload = runLarkCliJson([
    "base",
    "+base-create",
    "--name",
    baseName,
    "--time-zone",
    "Asia/Shanghai"
  ]);

  const base = basePayload.data.base;

  console.log("Creating table: Prompts");
  const tablePayload = runLarkCliJson([
    "base",
    "+table-create",
    "--base-token",
    base.base_token,
    "--name",
    "Prompts"
  ]);

  const table = tablePayload.data.table;

  for (const field of FIELD_DEFINITIONS) {
    console.log(`Creating field: ${field.name}`);
    runLarkCliJson([
      "base",
      "+field-create",
      "--base-token",
      base.base_token,
      "--table-id",
      table.id,
      "--json",
      JSON.stringify(field)
    ]);
  }

  const localConfig = {
    baseName,
    baseToken: base.base_token,
    tableId: table.id,
    baseUrl: base.url,
    model: config.model,
    locale: config.locale
  };

  writeLocalConfig(localConfig);

  console.log("Bootstrap completed.");
  console.log(JSON.stringify(localConfig, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
