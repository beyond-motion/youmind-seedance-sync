import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "../..");
export const DATA_DIR = path.join(ROOT, "data");
export const SITE_DIR = path.join(ROOT, "site");
export const LOCAL_CONFIG_PATH = path.join(ROOT, ".seedance.local.json");
export const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".config", "youmind-seedance-sync");
export const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config.json");
export const DEFAULT_R2_MANIFEST_PATH = path.join(GLOBAL_CONFIG_DIR, "r2-videos.json");

export const DEFAULT_MODEL = "seedance-2.0";
export const DEFAULT_LOCALE = "zh-CN";

function expandPathLikeShell(value) {
  if (!value) {
    return value;
  }

  let expanded = value.trim();

  if (expanded === "~") {
    expanded = os.homedir();
  } else if (expanded.startsWith("~/")) {
    expanded = path.join(os.homedir(), expanded.slice(2));
  }

  expanded = expanded.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (_, name) => process.env[name] || "");

  return expanded;
}

function resolveDirPath(value, fallback) {
  if (!value) {
    return fallback;
  }

  const expanded = expandPathLikeShell(value);
  return path.isAbsolute(expanded) ? expanded : path.resolve(ROOT, expanded);
}

export const CACHE_DIR = resolveDirPath(process.env.YOUMIND_CACHE_DIR || "", DATA_DIR);

export function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonSync(filePath, value) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadLocalConfig() {
  return readJsonIfExists(LOCAL_CONFIG_PATH) ?? {};
}

export function writeLocalConfig(config) {
  writeJsonSync(LOCAL_CONFIG_PATH, config);
}

export function loadGlobalConfig() {
  const globalConfigPath = resolveConfigPath(process.env.YOUMIND_GLOBAL_CONFIG_PATH || "", GLOBAL_CONFIG_PATH);
  return readJsonIfExists(globalConfigPath) ?? {};
}

export function writeGlobalConfig(config) {
  const globalConfigPath = resolveConfigPath(process.env.YOUMIND_GLOBAL_CONFIG_PATH || "", GLOBAL_CONFIG_PATH);
  writeJsonSync(globalConfigPath, config);
}

function mergeConfig(globalConfig, localConfig) {
  return {
    ...globalConfig,
    ...localConfig,
    r2: {
      ...(globalConfig?.r2 || {}),
      ...(localConfig?.r2 || {})
    }
  };
}

export function loadMergedConfig() {
  return mergeConfig(loadGlobalConfig(), loadLocalConfig());
}

function resolveConfigPath(value, fallback) {
  if (!value) {
    return fallback;
  }

  const expanded = expandPathLikeShell(value);
  return path.isAbsolute(expanded) ? expanded : path.resolve(ROOT, expanded);
}

export function resolveSyncTarget({ requireBase = true } = {}) {
  const merged = loadMergedConfig();

  const config = {
    model: process.env.YOUMIND_MODEL || merged.model || DEFAULT_MODEL,
    locale: process.env.YOUMIND_LOCALE || merged.locale || DEFAULT_LOCALE,
    baseToken:
      process.env.FEISHU_BASE_TOKEN ||
      merged.baseToken ||
      process.env.FEISHU_BASE_APP_TOKEN ||
      "",
    tableId:
      process.env.FEISHU_TABLE_ID ||
      merged.tableId ||
      process.env.FEISHU_BASE_TABLE_ID ||
      "",
    baseUrl: merged.baseUrl || "",
    baseName: merged.baseName || "YouMind Seedance 2.0 Prompts"
  };

  if (requireBase && (!config.baseToken || !config.tableId)) {
    throw new Error(
      "Missing Feishu base target. Set FEISHU_BASE_TOKEN / FEISHU_TABLE_ID or create .seedance.local.json first."
    );
  }

  return config;
}

function normalizeUrlBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function resolveR2Config({ requireBucket = false, requirePublicUrl = false } = {}) {
  const merged = loadMergedConfig();
  const manifestPath = resolveConfigPath(
    process.env.YOUMIND_R2_MANIFEST_PATH || merged.r2?.manifestPath || "",
    DEFAULT_R2_MANIFEST_PATH
  );
  const config = {
    enabled:
      process.env.YOUMIND_R2_ENABLED === "1" ||
      process.env.ENABLE_R2_MIRROR === "1" ||
      merged.r2?.enabled === true,
    bucketName:
      process.env.YOUMIND_R2_BUCKET ||
      process.env.R2_BUCKET_NAME ||
      merged.r2?.bucketName ||
      merged.r2?.bucket ||
      "",
    publicUrlBase: normalizeUrlBase(
      process.env.YOUMIND_R2_PUBLIC_URL_BASE ||
        process.env.R2_PUBLIC_URL_BASE ||
        merged.r2?.publicUrlBase ||
        merged.r2?.publicUrl ||
        ""
    ),
    location: process.env.YOUMIND_R2_LOCATION || merged.r2?.location || "apac",
    keyPrefix: String(
      process.env.YOUMIND_R2_KEY_PREFIX || merged.r2?.keyPrefix || "videos"
    ).replace(/^\/+|\/+$/g, ""),
    manifestPath
  };

  if (requireBucket && !config.bucketName) {
    throw new Error(
      "Missing R2 bucket name. Set YOUMIND_R2_BUCKET / R2_BUCKET_NAME or configure r2.bucketName in ~/.config/youmind-seedance-sync/config.json."
    );
  }

  if (requirePublicUrl && !config.publicUrlBase) {
    throw new Error(
      "Missing R2 public URL base. Set YOUMIND_R2_PUBLIC_URL_BASE or configure r2.publicUrlBase in ~/.config/youmind-seedance-sync/config.json."
    );
  }

  return config;
}

export function resolveFeishuAppCredentials() {
  const appId = process.env.FEISHU_APP_ID || "";
  const appSecret = process.env.FEISHU_APP_SECRET || "";

  if (!appId || !appSecret) {
    throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET.");
  }

  return { appId, appSecret };
}
