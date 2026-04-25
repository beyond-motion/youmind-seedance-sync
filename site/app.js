const state = {
  prompts: [],
  filtered: [],
  featuredOnly: false,
  query: "",
  modalPromptMode: "translated",
  activePrompt: null
};

const elements = {
  total: document.querySelector("#stat-total"),
  featured: document.querySelector("#stat-featured"),
  sync: document.querySelector("#stat-sync"),
  source: document.querySelector("#stat-source"),
  search: document.querySelector("#search-input"),
  clear: document.querySelector("#clear-search"),
  toggleFeatured: document.querySelector("#toggle-featured"),
  resultsCount: document.querySelector("#results-count"),
  cards: document.querySelector("#cards"),
  empty: document.querySelector("#empty-state"),
  modal: document.querySelector("#detail-modal"),
  modalMedia: document.querySelector("#modal-media"),
  modalBadge: document.querySelector("#modal-badge"),
  modalLanguage: document.querySelector("#modal-language"),
  modalDate: document.querySelector("#modal-date"),
  modalTitle: document.querySelector("#modal-title"),
  modalDescription: document.querySelector("#modal-description"),
  modalVideo: document.querySelector("#modal-video"),
  modalSource: document.querySelector("#modal-source"),
  modalDetail: document.querySelector("#modal-detail"),
  modalPrompt: document.querySelector("#modal-prompt"),
  tabTranslated: document.querySelector("#tab-translated"),
  tabOriginal: document.querySelector("#tab-original"),
  closeModal: document.querySelector("#close-modal"),
  copyPrompt: document.querySelector("#copy-prompt")
};

function formatDate(isoString) {
  if (!isoString) {
    return "Unknown";
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSearchText(prompt) {
  return [
    prompt.title,
    prompt.description,
    prompt.authorName,
    prompt.prompt,
    prompt.translatedPrompt
  ]
    .join("\n")
    .toLowerCase();
}

function getDisplayPromptText(prompt) {
  return prompt.translatedPrompt || prompt.prompt || "";
}

function getActivePromptText() {
  if (!state.activePrompt) {
    return "";
  }

  return state.modalPromptMode === "translated"
    ? state.activePrompt.translatedPrompt || state.activePrompt.prompt || ""
    : state.activePrompt.prompt || state.activePrompt.translatedPrompt || "";
}

function getReferenceVideoUrl(prompt) {
  return prompt.mirrorVideoUrl || "";
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for browsers that expose Clipboard API but block it in this context.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showCopiedState(button) {
  if (!button) {
    return;
  }

  const originalText = button.dataset.label || button.textContent || "复制";
  button.dataset.label = originalText;
  button.textContent = "已复制";
  button.classList.add("copied");
  window.clearTimeout(button.copyResetTimer);
  button.copyResetTimer = window.setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove("copied");
  }, 1200);
}

async function copyPromptText(promptText, button) {
  await writeClipboardText(promptText || "");
  showCopiedState(button);
}

function ensurePreviewVideoLoaded(video) {
  if (!video || video.src || !video.dataset.src) {
    return;
  }

  video.src = video.dataset.src;
  video.load();
}

function playPreviewVideo(video) {
  if (!video) {
    return;
  }

  ensurePreviewVideoLoaded(video);
  video
    .play()
    .then(() => {
      video.classList.add("playing");
    })
    .catch(() => {});
}

function pausePreviewVideo(video) {
  if (!video) {
    return;
  }

  video.pause();
  video.classList.remove("playing");
}

function pauseAllPreviewVideos() {
  elements.cards.querySelectorAll(".thumb-video").forEach((video) => {
    pausePreviewVideo(video);
  });
}

function applyFilters() {
  const normalizedQuery = state.query.trim().toLowerCase();

  state.filtered = state.prompts.filter((prompt) => {
    if (state.featuredOnly && !prompt.featured) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return getSearchText(prompt).includes(normalizedQuery);
  });

  renderCards();
}

function renderCards() {
  elements.resultsCount.textContent = `当前结果 ${state.filtered.length} / ${state.prompts.length}`;
  elements.cards.innerHTML = "";

  if (state.filtered.length === 0) {
    elements.empty.classList.remove("hidden");
    return;
  }

  elements.empty.classList.add("hidden");

  const fragment = document.createDocumentFragment();

  for (const prompt of state.filtered) {
    const previewVideoUrl = getReferenceVideoUrl(prompt);
    const promptText = getDisplayPromptText(prompt);
    const article = document.createElement("article");
    article.className = "prompt-card";
    article.innerHTML = `
      <button class="card-button" type="button" data-id="${prompt.id}">
        <div class="thumb-shell">
          ${
            previewVideoUrl
              ? `<video class="thumb thumb-video" muted loop playsinline preload="none" poster="${escapeHtml(
                  prompt.thumbnailUrl || ""
                )}" data-src="${escapeHtml(previewVideoUrl)}" aria-label="${escapeHtml(prompt.title)} 视频预览"></video>`
              : prompt.thumbnailUrl
                ? `<img class="thumb" src="${escapeHtml(prompt.thumbnailUrl)}" alt="${escapeHtml(prompt.title)}" />`
                : `<div class="thumb placeholder"></div>`
          }
          ${
            previewVideoUrl && prompt.thumbnailUrl
              ? `<img class="thumb thumb-poster" src="${escapeHtml(prompt.thumbnailUrl)}" alt="" loading="lazy" />`
              : ""
          }
          ${prompt.featured ? `<span class="card-badge">FEATURED</span>` : ""}
          ${previewVideoUrl ? `<span class="media-flag">PREVIEW</span>` : ""}
        </div>
        <div class="card-body">
          <p class="card-meta">${escapeHtml(prompt.authorName || "Unknown")} · ${escapeHtml(
      formatDate(prompt.sourcePublishedAt)
    )}</p>
          <h3>${escapeHtml(prompt.title)}</h3>
          <p>${escapeHtml(prompt.description || "No description.")}</p>
        </div>
      </button>
      ${
        promptText
          ? `<div class="card-prompt-wrap">
              <pre class="card-prompt">${escapeHtml(promptText)}</pre>
              <button class="copy-hover card-copy" type="button" data-id="${prompt.id}" aria-label="复制提示词">复制</button>
            </div>`
          : ""
      }
    `;

    const cardButton = article.querySelector(".card-button");
    const previewVideo = article.querySelector(".thumb-video");
    const copyButton = article.querySelector(".card-copy");

    cardButton.addEventListener("click", () => openModal(prompt.id));

    if (previewVideo) {
      cardButton.addEventListener("mouseenter", () => playPreviewVideo(previewVideo));
      cardButton.addEventListener("mouseleave", () => pausePreviewVideo(previewVideo));
      cardButton.addEventListener("focus", () => playPreviewVideo(previewVideo));
      cardButton.addEventListener("blur", () => pausePreviewVideo(previewVideo));
    }

    if (copyButton) {
      copyButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await copyPromptText(promptText, copyButton);
      });
    }

    fragment.appendChild(article);
  }

  elements.cards.appendChild(fragment);
}

function syncModalTabs() {
  const translatedActive = state.modalPromptMode === "translated";
  elements.tabTranslated.classList.toggle("active", translatedActive);
  elements.tabOriginal.classList.toggle("active", !translatedActive);
}

function updateModalPrompt() {
  if (!state.activePrompt) {
    return;
  }

  elements.modalPrompt.textContent = getActivePromptText();
  syncModalTabs();
}

function renderModalMedia(prompt) {
  elements.modalMedia.innerHTML = "";
  const shell = document.createElement("div");
  shell.className = "modal-media-shell";
  const referenceVideoUrl = getReferenceVideoUrl(prompt);

  if (referenceVideoUrl) {
    const video = document.createElement("video");
    video.className = "modal-player";
    video.src = referenceVideoUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";

    if (prompt.thumbnailUrl) {
      video.poster = prompt.thumbnailUrl;
    }

    shell.appendChild(video);

    const overlay = document.createElement("div");
    overlay.className = "media-overlay compact";
    overlay.innerHTML = `
      <span class="media-chip">R2 Mirror</span>
      <a class="media-overlay-link" href="${escapeHtml(referenceVideoUrl)}" target="_blank" rel="noreferrer">在新页打开</a>
    `;
    shell.appendChild(overlay);
  } else if (prompt.thumbnailUrl) {
    const image = document.createElement("img");
    image.src = prompt.thumbnailUrl;
    image.alt = prompt.title || "";
    shell.appendChild(image);

    const overlay = document.createElement("div");
    overlay.className = "media-overlay";
    overlay.innerHTML = `
      <span class="media-chip">Mirror unavailable</span>
      <p class="media-note">这条参考视频的源文件已失效，暂时没有可用的自有镜像。</p>
    `;
    shell.appendChild(overlay);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "modal-placeholder";
    placeholder.textContent = "No preview";
    shell.appendChild(placeholder);
  }

  elements.modalMedia.appendChild(shell);
}

function openModal(promptId) {
  const prompt = state.prompts.find((item) => String(item.id) === String(promptId));

  if (!prompt) {
    return;
  }

  pauseAllPreviewVideos();

  state.activePrompt = prompt;
  state.modalPromptMode = prompt.translatedPrompt ? "translated" : "original";

  renderModalMedia(prompt);
  elements.modalTitle.textContent = prompt.title || "";
  elements.modalDescription.textContent = prompt.description || "";
  elements.modalLanguage.textContent = prompt.language || "unknown";
  elements.modalDate.textContent = formatDate(prompt.sourcePublishedAt);
  elements.modalVideo.href = getReferenceVideoUrl(prompt) || "#";
  elements.modalVideo.textContent = "R2 镜像视频";
  elements.modalVideo.classList.toggle("hidden", !getReferenceVideoUrl(prompt));
  elements.modalSource.href = prompt.sourceLink || "#";
  elements.modalDetail.href = prompt.detailUrl || "#";
  elements.modalBadge.classList.toggle("hidden", !prompt.featured);
  updateModalPrompt();
  elements.modal.showModal();
}

function closeModal() {
  const video = elements.modalMedia.querySelector("video");

  if (video) {
    video.pause();
  }

  elements.modal.close();
  elements.modalMedia.innerHTML = "";
  state.activePrompt = null;
}

async function copyCurrentPrompt() {
  await copyPromptText(getActivePromptText(), elements.copyPrompt);
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    applyFilters();
  });

  elements.clear.addEventListener("click", () => {
    state.query = "";
    elements.search.value = "";
    applyFilters();
  });

  elements.toggleFeatured.addEventListener("click", () => {
    state.featuredOnly = !state.featuredOnly;
    elements.toggleFeatured.classList.toggle("active", state.featuredOnly);
    applyFilters();
  });

  elements.tabTranslated.addEventListener("click", () => {
    state.modalPromptMode = "translated";
    updateModalPrompt();
  });

  elements.tabOriginal.addEventListener("click", () => {
    state.modalPromptMode = "original";
    updateModalPrompt();
  });

  elements.closeModal.addEventListener("click", closeModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) {
      closeModal();
    }
  });
  elements.copyPrompt.addEventListener("click", copyCurrentPrompt);
}

async function loadData() {
  const response = await fetch("./data/prompts.json");

  if (!response.ok) {
    throw new Error(`Failed to load prompt data: ${response.status}`);
  }

  const payload = await response.json();
  const prompts = payload.prompts.slice().sort((left, right) => {
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }

    return new Date(right.sourcePublishedAt).getTime() - new Date(left.sourcePublishedAt).getTime();
  });

  state.prompts = prompts;
  state.filtered = prompts;

  elements.total.textContent = String(payload.total);
  elements.featured.textContent = String(prompts.filter((item) => item.featured).length);
  elements.sync.textContent = formatDate(payload.generatedAt);
  elements.source.textContent = payload.dataSourceLabel || payload.dataSource || "Unknown";

  applyFilters();
}

bindEvents();
loadData().catch((error) => {
  elements.resultsCount.textContent = "数据加载失败";
  elements.empty.classList.remove("hidden");
  elements.empty.innerHTML = `<h3>数据加载失败</h3><p>${escapeHtml(error.message)}</p>`;
});
