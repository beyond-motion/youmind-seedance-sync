import path from "path";
import { DATA_DIR, resolveSyncTarget, writeJsonSync } from "./lib/config.mjs";
import { fetchAllPrompts } from "./lib/youmind-client.mjs";

async function main() {
  const { locale, model } = resolveSyncTarget({ requireBase: false });

  console.log(`Fetching prompts for model=${model} locale=${locale} ...`);

  const result = await fetchAllPrompts({
    locale,
    model,
    onProgress({ page, totalPages, fetched, total }) {
      console.log(`  page ${page}/${totalPages} fetched=${fetched}/${total}`);
    }
  });

  const payload = {
    fetchedAt: new Date().toISOString(),
    locale,
    model,
    total: result.total,
    totalPages: result.totalPages,
    prompts: result.prompts
  };

  const outputPath = path.join(DATA_DIR, `prompts.${locale}.json`);
  writeJsonSync(outputPath, payload);

  console.log(`Saved ${result.prompts.length} prompts to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
