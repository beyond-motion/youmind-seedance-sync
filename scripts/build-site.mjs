import fs from "fs";
import path from "path";
import { DATA_DIR, SITE_DIR, resolveSyncTarget, writeJsonSync } from "./lib/config.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildSitePayload(source) {
  return {
    generatedAt: source.fetchedAt,
    locale: source.locale,
    model: source.model,
    total: source.total,
    prompts: source.prompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.title || "",
      description: prompt.description || "",
      prompt: prompt.content || "",
      translatedPrompt: prompt.translatedContent || "",
      language: prompt.language || "",
      featured: Boolean(prompt.featured),
      sourceLink: prompt.sourceLink || "",
      sourcePublishedAt: prompt.sourcePublishedAt || "",
      authorName: prompt.author?.name || "",
      authorLink: prompt.author?.link || "",
      detailUrl: `https://youmind.com/${source.locale}/seedance-2-0-prompts?id=${prompt.id}`,
      videoUrl: prompt.videos?.[0]?.sourceUrl || "",
      thumbnailUrl: prompt.videos?.[0]?.thumbnail || "",
      referenceImages: Array.isArray(prompt.referenceImages)
        ? prompt.referenceImages
            .map((item) => {
              if (typeof item === "string") {
                return item;
              }

              if (item && typeof item === "object" && typeof item.url === "string") {
                return item.url;
              }

              return "";
            })
            .filter(Boolean)
        : []
    }))
  };
}

function main() {
  const { locale } = resolveSyncTarget({ requireBase: false });
  const sourcePath = path.join(DATA_DIR, `prompts.${locale}.json`);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing ${sourcePath}. Run npm run fetch first.`);
  }

  const source = readJson(sourcePath);
  const payload = buildSitePayload(source);

  writeJsonSync(path.join(SITE_DIR, "data", "prompts.json"), payload);

  console.log(`Site data written to ${path.join(SITE_DIR, "data", "prompts.json")}`);
}

main();
