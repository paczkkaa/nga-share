export const STORAGE_KEY = "nga-share-files-v2";

export function getApiBaseCandidates() {
  const fromQuery = new URLSearchParams(location.search).get("api");
  const candidates = [
    fromQuery,
    `${location.origin}`,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean);
  return [...new Set(candidates)];
}
