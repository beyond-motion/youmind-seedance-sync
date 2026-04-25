import path from "path";
import { SITE_DIR, writeJsonSync } from "./lib/config.mjs";
import { loadSitePayloadForBuild } from "./lib/site-source.mjs";

async function main() {
  const { payload, source } = await loadSitePayloadForBuild();
  const outputPath = path.join(SITE_DIR, "data", "prompts.json");

  writeJsonSync(outputPath, payload);

  console.log(`Site data written to ${outputPath}`);
  console.log(`Site source: ${payload.dataSourceLabel} (${source})`);

  if (payload.validation?.checked) {
    console.log(
      `Feishu validation passed. expected=${payload.validation.expectedCount} actual=${payload.validation.actualCount}`
    );
  }

  if (payload.fallbackReason) {
    console.warn(`Fell back to YouMind source: ${payload.fallbackReason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
