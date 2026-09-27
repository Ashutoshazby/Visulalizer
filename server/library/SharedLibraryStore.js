import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from "@vercel/blob";

const LIBRARY_PATH = "saanjh/shared-library.json";
const memoryState = { profiles: {} };

export async function listProfiles() {
  const { state } = await readState();
  return Object.values(state.profiles)
    .map((profile) => ({
      name: profile.name,
      count: profile.songs.length,
      label: `${profile.name}'s favorite songs`
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function libraryStorageMode() {
  return hasBlobConfig() ? "vercel-blob" : process.env.VERCEL ? "unconfigured" : "memory";
}

export async function getProfile(userName) {
  const { state } = await readState();
  const key = slugify(userName);
  return state.profiles[key] || { name: cleanName(userName), songs: [] };
}

export async function registerProfile(userName) {
  return updateState((state) => {
    const key = slugify(userName);
    state.profiles[key] ||= { name: cleanName(userName), songs: [] };
    return state.profiles[key];
  });
}

export async function saveFavorite(userName, song) {
  return updateState((state) => {
    const key = slugify(userName);
    const profile = state.profiles[key] || { name: cleanName(userName), songs: [] };
    const nextSong = normalizeSong(song);
    profile.name = cleanName(userName);
    profile.songs = [nextSong, ...profile.songs.filter((item) => item.id !== nextSong.id)].slice(0, 200);
    state.profiles[key] = profile;
    return profile;
  });
}

export async function removeFavorite(userName, songId) {
  return updateState((state) => {
    const key = slugify(userName);
    const profile = state.profiles[key] || { name: cleanName(userName), songs: [] };
    profile.songs = profile.songs.filter((song) => song.id !== String(songId));
    state.profiles[key] = profile;
    return profile;
  });
}

async function updateState(mutator) {
  if (!hasBlobConfig()) {
    if (process.env.VERCEL) throw new Error("Vercel Blob storage is not connected.");
    const result = mutator(memoryState);
    return structuredClone(result);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { state, etag } = await readState();
    const result = mutator(state);
    try {
      await put(LIBRARY_PATH, JSON.stringify(state), {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        contentType: "application/json",
        ...(etag ? { ifMatch: etag } : {})
      });
      return structuredClone(result);
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError) || attempt === 3) throw error;
    }
  }

  throw new Error("Shared library update could not be completed.");
}

async function readState() {
  if (!hasBlobConfig()) {
    if (process.env.VERCEL) throw new Error("Vercel Blob storage is not connected.");
    return { state: memoryState, etag: null };
  }

  let result;
  try {
    result = await get(LIBRARY_PATH, { access: "private", useCache: false });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return { state: { profiles: {} }, etag: null };
    throw error;
  }
  if (!result || result.statusCode !== 200 || !result.stream) {
    return { state: { profiles: {} }, etag: null };
  }

  const payload = await new Response(result.stream).json().catch(() => ({ profiles: {} }));
  return { state: sanitizeState(payload), etag: result.blob.etag };
}

function sanitizeState(value) {
  if (!value || typeof value !== "object" || !value.profiles || typeof value.profiles !== "object") {
    return { profiles: {} };
  }
  return { profiles: value.profiles };
}

function normalizeSong(song) {
  return {
    id: String(song.id),
    title: String(song.title || "Untitled"),
    artist: String(song.artist || "Unknown artist"),
    album: String(song.album || "Favorite mix"),
    language: String(song.language || ""),
    artwork: String(song.artwork || "")
  };
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function slugify(value) {
  return cleanName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "guest";
}

function hasBlobConfig() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
}
