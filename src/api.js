import { detectCategoryByNameAndType } from "./utils.js";

export class ApiClient {
  constructor(baseUrlCandidates) {
    this.baseUrlCandidates = baseUrlCandidates.map((x) => x.replace(/\/$/, ""));
    this.baseUrl = this.baseUrlCandidates[0] || `${location.origin}`;
    this.remoteReady = false;
  }

  async init() {
    for (const candidate of this.baseUrlCandidates) {
      try {
        const response = await fetch(`${candidate}/api/health`, { cache: "no-store" });
        if (response.ok) {
          this.baseUrl = candidate;
          this.remoteReady = true;
          return true;
        }
      } catch {
        // Try next candidate.
      }
    }
    this.remoteReady = false;
    return false;
  }

  async listFiles() {
    if (!this.remoteReady) return [];
    const response = await fetch(`${this.baseUrl}/api/files`, { cache: "no-store" });
    if (!response.ok) throw new Error("Nie udalo sie pobrac listy plikow.");
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async uploadFile(file, options) {
    if (!this.remoteReady) {
      return this.uploadFileLocal(file, options);
    }
    return this.uploadFileRemote(file, options);
  }

  async uploadFileRemote(file, { expiry, tag, onProgress }) {
    const form = new FormData();
    form.append("file", file);
    form.append("expiry", expiry || "never");
    form.append("tag", tag || "");

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${this.baseUrl}/api/files`);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const pct = Math.round((event.loaded / event.total) * 100);
        onProgress?.(pct);
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error("Upload nie powiodl sie."));
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          reject(new Error("Bledna odpowiedz serwera."));
        }
      };

      xhr.onerror = () => reject(new Error("Blad sieci podczas uploadu."));
      xhr.send(form);
    });
  }

  async uploadFileLocal(file, { expiry, tag, onProgress }) {
    const started = performance.now();
    const total = Math.max(700, Math.min(2600, file.size / 90));
    await new Promise((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - started;
        const ratio = Math.min(1, elapsed / total);
        onProgress?.(Math.round(ratio * 100));
        if (ratio >= 1) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });

    const now = Date.now();
    const id = `local_${crypto.randomUUID()}`;
    return {
      id,
      name: file.name,
      type: file.type || "application/octet-stream",
      category: detectCategoryByNameAndType(file.name, file.type),
      size: file.size,
      tag,
      createdAt: now,
      expiresAt: computeExpiry(now, expiry),
      downloads: 0,
      link: `${location.origin}/files/${id}`,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      localOnly: true,
    };
  }

  async deleteFile(id) {
    if (!this.remoteReady || id.startsWith("local_")) return true;
    const response = await fetch(`${this.baseUrl}/api/files/${id}`, { method: "DELETE" });
    return response.ok;
  }

  async deleteExpired() {
    if (!this.remoteReady) return true;
    const response = await fetch(`${this.baseUrl}/api/files/expired`, { method: "DELETE" });
    return response.ok;
  }
}

function computeExpiry(now, preset) {
  if (preset === "1d") return now + 24 * 60 * 60 * 1000;
  if (preset === "7d") return now + 7 * 24 * 60 * 60 * 1000;
  if (preset === "30d") return now + 30 * 24 * 60 * 60 * 1000;
  return null;
}
