import { createJioSaavnProvider } from "../server/music/JioSaavnProvider.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Accept,Range",
  "Access-Control-Expose-Headers": "Content-Type,Content-Length,Content-Range,Accept-Ranges"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    try {
      const url = new URL(request.url);
      const provider = createJioSaavnProvider({
        baseUrl: env.SAAVN_API_BASE || "https://saavan-api-psi.vercel.app",
        maxRecommendationAttempts: 5,
        nativeDetailLimit: 4
      });

      if (url.pathname === "/") {
        return json({ ok: true, name: "Saanjh Music API", provider: provider.name, platform: "cloudflare-workers" });
      }
      if (url.pathname === "/api/health") {
        return json({ ok: true, provider: provider.name, library: "cloudflare-d1", platform: "cloudflare-workers" });
      }
      if (url.pathname === "/api/music/search" && request.method === "GET") {
        const songs = await provider.searchSongs({
          query: url.searchParams.get("query") || "",
          language: url.searchParams.get("language") || "auto",
          limit: boundedNumber(url.searchParams.get("limit"), 12, 1, 50)
        });
        return json({ ok: true, songs });
      }
      if (url.pathname.startsWith("/api/music/song/") && request.method === "GET") {
        const id = decodeURIComponent(url.pathname.slice("/api/music/song/".length));
        return json({ ok: true, song: await provider.getSong(id) });
      }
      if (url.pathname === "/api/music/recommendations" && request.method === "GET") {
        const songs = await provider.getRecommendations({
          mood: url.searchParams.get("mood") || "late-night",
          language: url.searchParams.get("language") || "auto",
          limit: boundedNumber(url.searchParams.get("limit"), 18, 1, 40)
        });
        return json({ ok: true, songs });
      }
      if (url.pathname === "/api/music/stream" && (request.method === "GET" || request.method === "HEAD")) {
        return streamSong(request, url, provider);
      }
      if (url.pathname === "/api/library/users" && request.method === "GET") {
        return json({ ok: true, users: await listProfiles(env.LIBRARY_DB) });
      }
      if (url.pathname === "/api/library" && request.method === "GET") {
        const user = cleanName(url.searchParams.get("user"));
        if (!user) return json({ ok: false, error: "Missing user name." }, 400);
        const profile = await getProfile(env.LIBRARY_DB, user);
        return json({ ok: true, user: profile.name, songs: profile.songs });
      }
      if (url.pathname === "/api/library/profile" && request.method === "POST") {
        const body = await readJson(request);
        const user = cleanName(body.user);
        if (!user) return json({ ok: false, error: "Missing user name." }, 400);
        const profile = await registerProfile(env.LIBRARY_DB, user);
        return json({ ok: true, user: profile.name, songs: profile.songs });
      }
      if (url.pathname === "/api/library/save" && request.method === "POST") {
        const body = await readJson(request);
        const user = cleanName(body.user);
        if (!user || !body.song?.id) return json({ ok: false, error: "Missing user name or song payload." }, 400);
        const profile = await saveFavorite(env.LIBRARY_DB, user, body.song);
        return json({ ok: true, user: profile.name, songs: profile.songs });
      }
      if (url.pathname === "/api/library/remove" && request.method === "POST") {
        const body = await readJson(request);
        const user = cleanName(body.user);
        const songId = String(body.songId || "").trim();
        if (!user || !songId) return json({ ok: false, error: "Missing user name or song id." }, 400);
        const profile = await removeFavorite(env.LIBRARY_DB, user, songId);
        return json({ ok: true, user: profile.name, songs: profile.songs });
      }

      return json({ ok: false, error: "Route not found." }, 404);
    } catch (error) {
      console.error("Worker request failed", error);
      return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected server error." }, 502);
    }
  }
};

async function streamSong(request, url, provider) {
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return json({ ok: false, error: "Missing song id." }, 400);

  const song = await provider.getSong(id);
  const streamUrl = provider.getStreamUrl(song);
  if (!streamUrl) return json({ ok: false, error: "No playable stream URL found for this song." }, 404);

  const upstreamHeaders = new Headers({ accept: "audio/*,*/*;q=0.9", "user-agent": "SaanjhMusic/1.2" });
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("range", range);
  const upstream = await fetch(streamUrl, { method: request.method, headers: upstreamHeaders });
  if (!upstream.ok && upstream.status !== 206) {
    return json({ ok: false, error: `Audio provider returned HTTP ${upstream.status}.` }, upstream.status < 500 ? upstream.status : 502);
  }

  const headers = new Headers(CORS_HEADERS);
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}

async function listProfiles(db) {
  const { results } = await db.prepare(`
    SELECT p.name, COUNT(f.song_id) AS count
    FROM profiles p
    LEFT JOIN favorites f ON f.profile_slug = p.slug
    GROUP BY p.slug, p.name
    ORDER BY p.name COLLATE NOCASE
  `).all();
  return results.map((profile) => ({
    name: profile.name,
    count: Number(profile.count || 0),
    label: `${profile.name}'s favorite songs`
  }));
}

async function getProfile(db, userName) {
  const slug = slugify(userName);
  const profile = await db.prepare("SELECT name FROM profiles WHERE slug = ?").bind(slug).first();
  const { results } = await db.prepare(`
    SELECT song_id AS id, title, artist, album, language, artwork
    FROM favorites
    WHERE profile_slug = ?
    ORDER BY saved_at DESC
    LIMIT 200
  `).bind(slug).all();
  return { name: profile?.name || cleanName(userName), songs: results };
}

async function registerProfile(db, userName) {
  const name = cleanName(userName);
  const slug = slugify(name);
  await db.prepare(`
    INSERT INTO profiles (slug, name, created_at, updated_at)
    VALUES (?, ?, unixepoch(), unixepoch())
    ON CONFLICT(slug) DO UPDATE SET name = excluded.name, updated_at = unixepoch()
  `).bind(slug, name).run();
  return getProfile(db, name);
}

async function saveFavorite(db, userName, song) {
  const profile = await registerProfile(db, userName);
  const normalized = normalizeSong(song);
  await db.prepare(`
    INSERT INTO favorites (profile_slug, song_id, title, artist, album, language, artwork, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(profile_slug, song_id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      language = excluded.language,
      artwork = excluded.artwork,
      saved_at = unixepoch()
  `).bind(slugify(profile.name), normalized.id, normalized.title, normalized.artist, normalized.album, normalized.language, normalized.artwork).run();
  return getProfile(db, profile.name);
}

async function removeFavorite(db, userName, songId) {
  const profile = await registerProfile(db, userName);
  await db.prepare("DELETE FROM favorites WHERE profile_slug = ? AND song_id = ?")
    .bind(slugify(profile.name), String(songId)).run();
  return getProfile(db, profile.name);
}

function normalizeSong(song) {
  return {
    id: String(song.id),
    title: String(song.title || "Untitled").slice(0, 300),
    artist: String(song.artist || "Unknown artist").slice(0, 500),
    album: String(song.album || "Favorite mix").slice(0, 300),
    language: String(song.language || "").slice(0, 40),
    artwork: String(song.artwork || "").slice(0, 1000)
  };
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Expected an application/json request body.");
  return request.json();
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function slugify(value) {
  return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "guest";
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.floor(parsed))) : fallback;
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}
