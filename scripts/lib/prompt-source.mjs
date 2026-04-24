import path from "path";
import { DATA_DIR, readJsonIfExists, writeJsonSync } from "./config.mjs";
import { fetchAllPrompts } from "./youmind-client.mjs";

function getCachePath(locale) {
  return path.join(DATA_DIR, `prompts.${locale}.json`);
}

function isUsableCache(payload, { locale, model }) {
  return (
    payload &&
    payload.locale === locale &&
    payload.model === model &&
    Array.isArray(payload.prompts)
  );
}

export async function loadOrFetchPromptPayload({
  locale,
  model,
  onProgress,
  forceRefresh = false
}) {
  const cachePath = getCachePath(locale);
  const cached = readJsonIfExists(cachePath);

  if (!forceRefresh && isUsableCache(cached, { locale, model })) {
    return {
      source: "cache",
      cachePath,
      payload: cached
    };
  }

  const fetchedAt = new Date().toISOString();
  const result = await fetchAllPrompts({
    locale,
    model,
    onProgress
  });

  const payload = {
    fetchedAt,
    locale,
    model,
    total: result.total,
    totalPages: result.totalPages,
    prompts: result.prompts
  };

  writeJsonSync(cachePath, payload);

  return {
    source: "remote",
    cachePath,
    payload
  };
}
