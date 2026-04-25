import {
  loadGlobalConfig,
  loadLocalConfig,
  writeGlobalConfig,
  resolveR2Config
} from "./lib/config.mjs";
import {
  createR2Bucket,
  enableR2DevUrl,
  ensureWranglerAuthenticated,
  getR2DevUrl
} from "./lib/wrangler-cli.mjs";

function isAlreadyExistsError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /already exists|duplicate|not unique/i.test(message);
}

function isAlreadyEnabledError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /already enabled|has already been enabled/i.test(message);
}

async function main() {
  const localConfig = loadLocalConfig();
  const globalConfig = loadGlobalConfig();
  const r2Config = resolveR2Config();
  const bucketName = r2Config.bucketName || "violin86318-youmind-seedance-videos";
  const location = r2Config.location || "apac";
  const keyPrefix = r2Config.keyPrefix || "videos";

  ensureWranglerAuthenticated();

  try {
    console.log(`Creating R2 bucket: ${bucketName} (${location})`);
    createR2Bucket(bucketName, location);
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }

    console.log(`Bucket already exists: ${bucketName}`);
  }

  try {
    console.log("Enabling public dev URL ...");
    enableR2DevUrl(bucketName);
  } catch (error) {
    if (!isAlreadyEnabledError(error)) {
      throw error;
    }

    console.log("Public dev URL already enabled.");
  }

  const publicUrlBase = getR2DevUrl(bucketName);
  const nextGlobalConfig = {
    ...globalConfig,
    model: globalConfig.model || localConfig.model,
    locale: globalConfig.locale || localConfig.locale,
    r2: {
      ...(globalConfig.r2 || {}),
      bucketName,
      publicUrlBase,
      location,
      keyPrefix,
      enabled: true
    }
  };

  writeGlobalConfig(nextGlobalConfig);

  console.log("R2 configuration saved.");
  console.log(
    JSON.stringify(
      {
        bucketName,
        publicUrlBase,
        location,
        keyPrefix
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
