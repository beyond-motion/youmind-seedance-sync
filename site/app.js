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
    const article = document.createElement("article");
    article.className = "prompt-card";
    article.innerHTML = `
      <button class="card-button" type="button" data-id="${prompt.id}">
        <div class="thumb-shell">
          ${
            prompt.thumbnailUrl
              ? `<img class="thumb" src="${escapeHtml(prompt.thumbnailUrl)}" alt="${escapeHtml(prompt.title)}" />`
              : `<div class="thumb placeholder"></div>`
          }
          ${prompt.featured ? `<span class="card-badge">FEATURED</span>` : ""}
          ${prompt.videoEmbedUrl ? `<span class="media-flag">VIDEO</span>` : ""}
        </div>
        <div class="card-body">
          <p class="card-meta">${escapeHtml(prompt.authorName || "Unknown")} · ${escapeHtml(
      formatDate(prompt.sourcePublishedAt)
    )}</p>
          <h3>${escapeHtml(prompt.title)}</h3>
          <p>${escapeHtml(prompt.description || "No description.")}</p>
        </div>
      </button>
    `;

    article.querySelector(".card-button").addEventListener("click", () => openModal(prompt.id));
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

  const promptText =
    state.modalPromptMode === "translated"
      ? state.activePrompt.translatedPrompt || state.activePrompt.prompt
      : state.activePrompt.prompt || state.activePrompt.translatedPrompt;

  elements.modalPrompt.textContent = promptText || "";
  syncModalTabs();
}

function renderModalMedia(prompt) {
  elements.modalMedia.innerHTML = "";

  if (prompt.videoEmbedUrl) {
    const iframe = document.createElement("iframe");
    iframe.className = "modal-video";
    iframe.src = prompt.videoEmbedUrl;
    iframe.title = prompt.title || "Prompt video preview";
    iframe.loading = "lazy";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    elements.modalMedia.appendChild(iframe);
    return;
  }

  if (prompt.thumbnailUrl) {
    const image = document.createElement("img");
    image.src = prompt.thumbnailUrl;
    image.alt = prompt.title || "";
    elements.modalMedia.appendChild(image);
    return;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "modal-placeholder";
  placeholder.textContent = "No preview";
  elements.modalMedia.appendChild(placeholder);
}

function openModal(promptId) {
  const prompt = state.prompts.find((item) => String(item.id) === String(promptId));

  if (!prompt) {
    return;
  }

  state.activePrompt = prompt;
  state.modalPromptMode = prompt.translatedPrompt ? "translated" : "original";

  renderModalMedia(prompt);
  elements.modalTitle.textContent = prompt.title || "";
  elements.modalDescription.textContent = prompt.description || "";
  elements.modalLanguage.textContent = prompt.language || "unknown";
  elements.modalDate.textContent = formatDate(prompt.sourcePublishedAt);
  elements.modalSource.href = prompt.sourceLink || "#";
  elements.modalDetail.href = prompt.detailUrl || "#";
  elements.modalBadge.classList.toggle("hidden", !prompt.featured);
  updateModalPrompt();
  elements.modal.showModal();
}

function closeModal() {
  elements.modal.close();
  elements.modalMedia.innerHTML = "";
  state.activePrompt = null;
}

async function copyCurrentPrompt() {
  if (!state.activePrompt) {
    return;
  }

  const promptText =
    state.modalPromptMode === "translated"
      ? state.activePrompt.translatedPrompt || state.activePrompt.prompt
      : state.activePrompt.prompt || state.activePrompt.translatedPrompt;

  await navigator.clipboard.writeText(promptText || "");
  elements.copyPrompt.textContent = "已复制";
  window.setTimeout(() => {
    elements.copyPrompt.textContent = "复制提示词";
  }, 1200);
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
