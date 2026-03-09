export function formatDate(value) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatSize(size) {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let current = size / 1024;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 100 ? 0 : current >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function normalizeTag(text) {
  return text.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 24);
}

export function csvEscape(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export function detectCategoryByNameAndType(name, type) {
  if (type?.startsWith("image/")) return "image";
  if (type?.startsWith("video/")) return "video";
  if (type?.startsWith("audio/")) return "audio";

  const docs = ["pdf", "doc", "docx", "txt", "xlsx", "xls", "ppt", "pptx", "odt", "csv"];
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (docs.includes(ext)) return "doc";
  return "other";
}

