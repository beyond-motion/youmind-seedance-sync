import { loadGlobalConfig, resolveR2Config, writeGlobalConfig } from "./lib/config.mjs";

function main() {
  const r2Config = resolveR2Config({ requirePublicUrl: true });
  const globalConfig = loadGlobalConfig();

  writeGlobalConfig({
    ...globalConfig,
    r2: {
      ...(globalConfig.r2 || {}),
      publicUrlBase: r2Config.publicUrlBase
    }
  });

  console.log(`Saved R2 public URL base: ${r2Config.publicUrlBase}`);
}

main();
