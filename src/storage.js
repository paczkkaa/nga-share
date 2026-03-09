import { STORAGE_KEY } from "./config.js";

export function loadLocalFiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalFiles(files) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

