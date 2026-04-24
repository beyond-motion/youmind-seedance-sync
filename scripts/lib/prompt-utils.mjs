import crypto from "crypto";

export function chunk(items, size) {
  const groups = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
}

function joinUrlList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return "";
  }

  const normalized = values
    .map((value) => {
      if (typeof value === "string") {
        return value.trim();
      }

      if (value && typeof value === "object" && typeof value.url === "string") {
        return value.url.trim();
      }

      return "";
    })
    .filter(Boolean);

  return normalized.join("\n");
}

function getPrimaryVideo(prompt) {
  if (Array.isArray(prompt.videos) && prompt.videos.length > 0) {
    return prompt.videos[0];
  }

  return null;
}

export function buildContentHash(row) {
  const stablePayload = {
    promptId: row["Prompt ID"],
    title: row["Title"],
    description: row["Description"],
    prompt: row["Prompt"],
    translatedPrompt: row["Translated Prompt"],
    language: row["Language"],
    featured: row["Featured"],
    sourceLink: row["Source Link"],
    sourcePublishedAt: row["Source Published At"],
    author: row["Author"],
    authorLink: row["Author Link"],
    videoUrl: row["Video URL"],
    thumbnailUrl: row["Thumbnail URL"],
    referenceImages: row["Reference Images"],
    detailUrl: row["Detail URL"],
    model: row["Model"]
  };

  return crypto.createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex");
}

export function normalizePromptToRow(prompt, { locale, model, syncedAt, active = true }) {
  const primaryVideo = getPrimaryVideo(prompt);

  const row = {
    "Prompt ID": String(prompt.id ?? ""),
    Title: prompt.title || "",
    Description: prompt.description || "",
    Prompt: prompt.content || "",
    "Translated Prompt": prompt.translatedContent || "",
    Language: prompt.language || "",
    Featured: Boolean(prompt.featured),
    Active: Boolean(active),
    "Source Link": prompt.sourceLink || "",
    "Source Published At": prompt.sourcePublishedAt || "",
    Author: prompt.author?.name || "",
    "Author Link": prompt.author?.link || "",
    "Video URL": primaryVideo?.sourceUrl || "",
    "Thumbnail URL": primaryVideo?.thumbnail || "",
    "Reference Images": joinUrlList(prompt.referenceImages || prompt.sourceReferenceImages || []),
    "Detail URL": `https://youmind.com/${locale}/seedance-2-0-prompts?id=${prompt.id}`,
    Model: model,
    "Content Hash": "",
    "Synced At": syncedAt
  };

  row["Content Hash"] = buildContentHash(row);

  return row;
}

export function rowToValues(row, fieldOrder) {
  return fieldOrder.map((fieldName) => row[fieldName] ?? "");
}
