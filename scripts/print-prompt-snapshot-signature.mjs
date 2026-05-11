import { readFileSync } from "fs";
import crypto from "crypto";

function buildPromptSignature(payload) {
  const prompts = Array.isArray(payload?.prompts) ? payload.prompts : [];
  const normalizedPrompts = prompts
    .map((prompt) => ({
      id: String(prompt?.id ?? ""),
      title: prompt?.title || "",
      description: prompt?.description || "",
      content: prompt?.content || "",
      translatedContent: prompt?.translatedContent || "",
      language: prompt?.language || "",
      featured: Boolean(prompt?.featured),
      sourceLink: prompt?.sourceLink || "",
      sourcePublishedAt: prompt?.sourcePublishedAt || "",
      authorName: prompt?.author?.name || "",
      authorLink: prompt?.author?.link || "",
      videos: Array.isArray(prompt?.videos)
        ? prompt.videos.map((video) => ({
            sourceUrl: video?.sourceUrl || "",
            thumbnail: video?.thumbnail || "",
            caption: video?.caption || ""
          }))
        : [],
      referenceImages: Array.isArray(prompt?.referenceImages) ? prompt.referenceImages : [],
      sourceReferenceImages: Array.isArray(prompt?.sourceReferenceImages)
        ? prompt.sourceReferenceImages
        : []
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const stablePayload = {
    locale: payload?.locale || "",
    model: payload?.model || "",
    total: normalizedPrompts.length,
    prompts: normalizedPrompts
  };

  return crypto.createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");
}

const payloadPath = process.argv[2];

if (!payloadPath) {
  console.error("Usage: node scripts/print-prompt-snapshot-signature.mjs <payload-json-path>");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
console.log(buildPromptSignature(payload));
