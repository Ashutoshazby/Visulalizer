export const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;

export async function getRecommendations({ mood, language, limit = 18 }) {
  const url = new URL("/api/music/recommendations", API_BASE);
  url.searchParams.set("mood", mood);
  url.searchParams.set("language", language);
  url.searchParams.set("limit", String(limit));
  const json = await fetchJson(url);
  return json.songs || [];
}

export async function searchSongs({ query, language, limit = 12 }) {
  const url = new URL("/api/music/search", API_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("language", language);
  url.searchParams.set("limit", String(limit));
  const json = await fetchJson(url);
  return json.songs || [];
}

export function getStreamUrl(song) {
  if (!song?.id) return "";
  const url = new URL("/api/music/stream", API_BASE);
  url.searchParams.set("id", song.id);
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `Request failed with ${response.status}`);
  }
  return json;
}
