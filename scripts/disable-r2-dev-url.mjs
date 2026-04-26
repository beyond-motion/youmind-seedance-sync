import { resolveR2Config } from "./lib/config.mjs";
import { disableR2DevUrl, ensureWranglerAuthenticated, getR2DevUrl } from "./lib/wrangler-cli.mjs";

function main() {
  const r2Config = resolveR2Config({ requireBucket: true });

  ensureWranglerAuthenticated();
  disableR2DevUrl(r2Config.bucketName);

  let status = "";

  try {
    status = getR2DevUrl(r2Config.bucketName);
  } catch (error) {
    status = error instanceof Error ? error.message : String(error);
  }

  console.log(`Disabled public r2.dev access for ${r2Config.bucketName}.`);
  console.log(status);
}

main();
