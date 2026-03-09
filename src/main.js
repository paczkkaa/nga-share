import { ApiClient } from "./api.js";
import { getApiBaseCandidates } from "./config.js";
import { loadLocalFiles, saveLocalFiles } from "./storage.js";
import { csvEscape, formatDate, formatSize, normalizeTag } from "./utils.js";

const state = {
  files: [],
  query: "",
  type: "all",
  sort: "newest",
  mode: "Lokalny",
};

const api = new ApiClient(getApiBaseCandidates());

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  pickBtn: document.getElementById("pickBtn"),
  expirySelect: document.getElementById("expirySelect"),
  tagInput: document.getElementById("tagInput"),
  uploadQueue: document.getElementById("uploadQueue"),
  searchInput: document.getElementById("searchInput"),
  typeFilter: document.getElementById("typeFilter"),
  sortSelect: document.getElementById("sortSelect"),
  library: document.getElementById("library"),
  template: document.getElementById("fileCardTemplate"),
  exportBtn: document.getElementById("exportBtn"),
  clearExpiredBtn: document.getElementById("clearExpiredBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  toast: document.getElementById("toast"),
  statFiles: document.getElementById("statFiles"),
  statSize: document.getElementById("statSize"),
  statDownloads: document.getElementById("statDownloads"),
  modeBadge: document.getElementById("modeBadge"),
};

init();

async function init() {
  bindUploadEvents();
  bindControlEvents();

  try {
    const remoteReady = await api.init();
    if (remoteReady) {
      state.mode = "Online API";
      state.files = await api.listFiles();
    } else {
      state.mode = "Lokalny";
      state.files = loadLocalFiles();
    }
  } catch {
    state.mode = "Lokalny";
    state.files = loadLocalFiles();
  }

  updateModeBadge();
  await cleanupExpired(false);
  render();
  registerServiceWorker();
}

function updateModeBadge() {
  els.modeBadge.textContent = state.mode;
}

function bindUploadEvents() {
  els.pickBtn.addEventListener("click", () => {
    if (document.activeElement === els.pickBtn) {
      els.fileInput.click();
    }
  });
  els.pickBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      els.fileInput.click();
    }
  });
  els.fileInput.addEventListener("change", (event) => {
    handleFileSelection(event.target.files);
    event.target.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.dropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.dropzone.classList.remove("drag-over");
    });
  });

  els.dropzone.addEventListener("drop", (event) => {
    const list = event.dataTransfer?.files;
    if (!list || !list.length) return;
    handleFileSelection(list);
  });
}

function bindControlEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  els.typeFilter.addEventListener("change", (event) => {
    state.type = event.target.value;
    render();
  });

  els.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  els.exportBtn.addEventListener("click", exportCsv);
  els.clearExpiredBtn.addEventListener("click", () => cleanupExpired(true));
  els.clearAllBtn.addEventListener("click", clearAllFiles);
}

function handleFileSelection(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  const expiry = els.expirySelect.value;
  const tag = normalizeTag(els.tagInput.value);
  files.forEach((file) => enqueueUpload(file, expiry, tag));
}

function enqueueUpload(file, expiry, tag) {
  const row = document.createElement("div");
  row.className = "queue-item";
  row.innerHTML = `
    <div class="queue-head">
      <strong>${escapeHtml(file.name)}</strong>
      <span>${formatSize(file.size)}</span>
    </div>
    <div class="progress"><span></span></div>
  `;
  const bar = row.querySelector(".progress > span");
  els.uploadQueue.prepend(row);

  api.uploadFile(file, {
    expiry,
    tag,
    onProgress: (value) => {
      bar.style.width = `${value}%`;
    },
  }).then((item) => {
    state.files.unshift(item);
    persist();
    render();
    showToast(`Dodano: ${file.name}`);
    setTimeout(() => row.remove(), 450);
  }).catch((error) => {
    row.remove();
    showToast(error.message || "Upload nieudany.");
  });
}

function render() {
  renderStats();
  renderLibrary(getVisibleFiles());
}

function getVisibleFiles() {
  const now = Date.now();
  return state.files
    .filter((item) => !item.expiresAt || item.expiresAt > now)
    .filter((item) => state.type === "all" || item.category === state.type)
    .filter((item) => {
      if (!state.query) return true;
      const haystack = `${item.name} ${item.tag || ""} ${item.type}`.toLowerCase();
      return haystack.includes(state.query);
    })
    .sort(sortFn(state.sort));
}

function renderLibrary(items) {
  els.library.innerHTML = "";
  if (!items.length) {
    els.library.innerHTML = `<div class="empty">Brak plikow dla aktualnych filtrow.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const img = node.querySelector(".thumb");
    const icon = node.querySelector(".file-icon");

    node.querySelector(".file-name").textContent = item.name;
    node.querySelector(".file-type").textContent = item.category;
    node.querySelector(".meta").textContent = `${formatSize(item.size)} | ${formatDate(item.createdAt)}`;

    const tag = node.querySelector(".tag-pill");
    if (item.tag) {
      tag.hidden = false;
      tag.textContent = `#${item.tag}`;
    }

    node.querySelector(".expiry-pill").textContent = item.expiresAt ? `Wygasa: ${formatDate(item.expiresAt)}` : "Bez limitu";
    node.querySelector(".download-pill").textContent = `Pobrania: ${item.downloads}`;

    if (item.preview) {
      img.src = item.preview;
      img.addEventListener("error", () => {
        img.hidden = true;
        icon.style.display = "grid";
      }, { once: true });
      img.hidden = false;
      icon.style.display = "none";
    }

    node.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => handleCardAction(button.dataset.action, item.id));
    });

    fragment.appendChild(node);
  });
  els.library.appendChild(fragment);
}

function handleCardAction(action, id) {
  const item = state.files.find((file) => file.id === id);
  if (!item) return;

  if (action === "download") {
    item.downloads += 1;
    persist();
    render();
    window.open(item.link, "_blank", "noopener,noreferrer");
    showToast("Otwarto link pobierania.");
    return;
  }

  if (action === "copy") {
    navigator.clipboard.writeText(item.link)
      .then(() => showToast("Link skopiowany."))
      .catch(() => showToast("Nie udalo sie skopiowac linku."));
    return;
  }

  if (action === "share") {
    const shareData = { title: item.name, text: "Pobierz plik", url: item.link };
    if (navigator.share) {
      navigator.share(shareData)
        .then(() => showToast("Udostepniono."))
        .catch(() => showToast("Anulowano udostepnianie."));
    } else {
      navigator.clipboard.writeText(item.link)
        .then(() => showToast("Web Share niedostepne. Link skopiowany."))
        .catch(() => showToast("Web Share niedostepne."));
    }
    return;
  }

  if (action === "delete") {
    api.deleteFile(id).finally(() => {
      state.files = state.files.filter((file) => file.id !== id);
      persist();
      render();
      showToast("Usunieto plik.");
    });
  }
}

function renderStats() {
  const now = Date.now();
  const active = state.files.filter((item) => !item.expiresAt || item.expiresAt > now);
  const totalSize = active.reduce((sum, item) => sum + item.size, 0);
  const totalDownloads = active.reduce((sum, item) => sum + item.downloads, 0);

  els.statFiles.textContent = String(active.length);
  els.statSize.textContent = formatSize(totalSize);
  els.statDownloads.textContent = String(totalDownloads);
}

async function cleanupExpired(manual) {
  const before = state.files.length;
  const now = Date.now();
  state.files = state.files.filter((item) => !item.expiresAt || item.expiresAt > now);
  const removed = before - state.files.length;
  if (removed > 0) {
    persist();
    render();
  }
  if (state.mode === "Online API") {
    await api.deleteExpired().catch(() => {});
  }
  if (manual) showToast(removed ? `Usunieto wygasle: ${removed}` : "Brak wygaslych plikow.");
}

async function clearAllFiles() {
  if (!confirm("Na pewno usunac wszystkie wpisy plikow?")) return;
  if (state.mode === "Online API") {
    await Promise.all(state.files.map((item) => api.deleteFile(item.id).catch(() => false)));
  }
  state.files = [];
  persist();
  render();
  showToast("Wyczyszczono liste.");
}

function exportCsv() {
  if (!state.files.length) {
    showToast("Brak danych do eksportu.");
    return;
  }
  const lines = ["id,nazwa,typ,kategoria,rozmiar,tag,utworzono,wygasa,pobrania,link"];
  state.files.forEach((item) => {
    lines.push([
      item.id,
      item.name,
      item.type,
      item.category,
      item.size,
      item.tag || "",
      new Date(item.createdAt).toISOString(),
      item.expiresAt ? new Date(item.expiresAt).toISOString() : "",
      item.downloads,
      item.link,
    ].map(csvEscape).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nga-share-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Wyeksportowano CSV.");
}

function sortFn(mode) {
  if (mode === "oldest") return (a, b) => a.createdAt - b.createdAt;
  if (mode === "largest") return (a, b) => b.size - a.size;
  if (mode === "smallest") return (a, b) => a.size - b.size;
  if (mode === "name") return (a, b) => a.name.localeCompare(b.name, "pl");
  if (mode === "downloads") return (a, b) => b.downloads - a.downloads;
  return (a, b) => b.createdAt - a.createdAt;
}

function persist() {
  if (state.mode === "Lokalny") {
    saveLocalFiles(state.files);
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1700);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
