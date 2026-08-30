import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const serverDir = path.join(root, "dist", "server");
await mkdir(serverDir, { recursive: true });

await writeFile(path.join(serverDir, "index.js"), `const API_BASE = "https://saavan-api-psi.vercel.app";

const MOOD_QUERIES = {
  romantic: ["romantic hindi", "punjabi romantic", "love songs hindi", "arijit love", "atif aslam romantic", "bollywood love songs", "jubin nautiyal romantic", "vishal mishra love"],
  sad: ["sad hindi songs", "punjabi sad songs", "emotional hindi", "arijit sad", "kk sad songs", "atif sad songs", "jubin sad", "vishal mishra sad"],
  "late-night": ["late night hindi", "lofi hindi", "arijit night", "kk unplugged", "bollywood chill night", "hindi acoustic", "mohit chauhan unplugged", "jubin nautiyal acoustic", "vishal mishra lofi", "atif aslam unplugged"],
  nostalgic: ["90s hindi songs", "old punjabi songs", "kumar sanu", "udit narayan", "alka yagnik", "sonu nigam old"],
  highway: ["drive songs hindi", "punjabi highway", "desi drive", "bollywood road trip", "hindi travel songs", "punjabi drive"],
  energetic: ["punjabi party", "haryanvi energetic", "bollywood dance", "hindi party songs", "punjabi beat", "haryanvi dance"],
  chill: ["hindi chill", "punjabi chill", "lofi bollywood", "hindi acoustic", "soft bollywood", "indie hindi", "prateek kuhad", "anuv jain"],
  auto: ["hindi hits", "punjabi hits", "haryanvi songs", "bollywood hits", "arijit singh", "kk songs"]
};

const DISCOVERY_QUERIES = {
  hindi: ["arijit singh", "kk songs", "jubin nautiyal", "vishal mishra", "mohit chauhan", "shreya ghoshal", "atif aslam", "pritam songs", "mithoon songs", "bollywood acoustic", "bollywood lofi", "hindi indie", "hindi songs 2024", "hindi songs 2023", "bollywood romantic", "bollywood sad", "hindi unplugged", "armaan malik", "sachet parampara", "amit trivedi"],
  punjabi: ["punjabi romantic", "punjabi chill", "punjabi sad", "punjabi drive", "ap dhillon", "diljit dosanjh", "satinder sartaaj", "amrinder gill", "b praak", "harrdy sandhu", "gurdas maan", "nimrat khaira"],
  haryanvi: ["haryanvi songs", "haryanvi romantic", "haryanvi chill", "haryanvi latest", "haryanvi drive", "renuka panwar", "masoom sharma", "raj mawar", "vishvajeet choudhary"],
  auto: ["arijit singh", "kk songs", "jubin nautiyal", "vishal mishra", "punjabi romantic", "haryanvi songs", "bollywood lofi", "hindi indie", "bollywood acoustic", "punjabi chill"]
};

const LANGUAGE_HINTS = { hindi: "hindi", punjabi: "punjabi", haryanvi: "haryanvi" };

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    try {
      if (url.pathname === "/api/health") return json(request, { ok: true, provider: "jiosaavn-compatible" });
      if (url.pathname === "/api/music/search") {
        const query = String(url.searchParams.get("query") || "");
        const language = String(url.searchParams.get("language") || "auto");
        const limit = Number(url.searchParams.get("limit") || 12);
        const songs = await searchSongs({ query, language, limit });
        return json(request, { ok: true, songs });
      }
      if (url.pathname === "/api/music/recommendations") {
        const mood = String(url.searchParams.get("mood") || "late-night");
        const language = String(url.searchParams.get("language") || "auto");
        const limit = Number(url.searchParams.get("limit") || 18);
        const songs = await getRecommendations({ mood, language, limit });
        return json(request, { ok: true, songs });
      }
      const songMatch = url.pathname.match(/^\\/api\\/music\\/song\\/(.+)$/);
      if (songMatch) {
        const song = await getSong(decodeURIComponent(songMatch[1]));
        return json(request, { ok: true, song });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return json(request, { ok: false, error: error.message || "Music provider is unavailable." }, 502);
    }
  }
};

async function getRecommendations({ mood = "auto", language = "auto", limit = 18 }) {
  const pool = [];
  const discovery = DISCOVERY_QUERIES[language] || DISCOVERY_QUERIES.auto;
  const queries = shuffle([...(MOOD_QUERIES[mood] || MOOD_QUERIES.auto), ...discovery, ...MOOD_QUERIES.auto]);
  const pages = shuffle([0, 1, 2, 3, 4, 5]);
  const attempts = Math.min(16, queries.length);
  for (let i = 0; i < attempts && uniqueSongs(pool).length < limit * 1.25; i += 1) {
    const songs = await searchSongs({ query: queries[i], language, limit: Math.ceil(limit / 2), page: pages[i % pages.length] });
    pool.push(...songs);
  }
  return shuffle(uniqueSongs(pool)).slice(0, limit);
}

async function searchSongs({ query, language = "auto", limit = 12, page = 0 }) {
  if (!query.trim()) return [];
  const requestedQuery = withLanguage(query, language);
  const url = new URL(API_BASE + "/api/search/songs");
  url.searchParams.set("query", requestedQuery);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  const data = await fetchJson(url);
  return (data?.data?.results || []).map(normalizeSong).filter((song) => song.streamUrl);
}

async function getSong(id) {
  if (!id) throw new Error("Missing song id.");
  const url = new URL(API_BASE + "/api/songs/" + encodeURIComponent(id));
  const data = await fetchJson(url);
  const raw = Array.isArray(data?.data) ? data.data[0] : data?.data;
  const song = normalizeSong(raw);
  if (!song.id) throw new Error("Invalid song response.");
  return song;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "NightDriveRadio/1.0" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) throw new Error(data?.message || "Provider request failed.");
  return data;
}

function normalizeSong(raw = {}) {
  const artists = raw.primaryArtists || raw.primary_artists || raw.subtitle || raw.artist || "";
  const artistList = raw.artists?.primary?.map((artist) => artist.name).filter(Boolean);
  const downloadUrl = raw.downloadUrl || raw.download_url || [];
  return {
    id: raw.id || raw.songid || raw.song_id || "",
    title: clean(raw.name || raw.title || raw.song || "Unknown road song"),
    artist: clean((artistList?.length ? artistList.join(", ") : artists) || "Unknown artist"),
    album: clean(raw.album?.name || raw.album || raw.albumName || ""),
    language: String(raw.language || raw.song_language || "unknown").toLowerCase(),
    year: raw.year || "",
    duration: Number(raw.duration || raw.length / 1000 || 0),
    artwork: bestMedia(raw.image || raw.image_url || raw.song_image),
    streamUrl: bestMedia(downloadUrl) || raw.media_url || raw.url || "",
    rawProvider: "jiosaavn-compatible",
    moods: inferMoods(String(raw.name || raw.title || "") + " " + String(raw.album?.name || raw.album || "")),
    nightDrive: 0.8,
    energy: inferEnergy(raw)
  };
}

function bestMedia(value) {
  if (!value) return "";
  if (typeof value === "string") return value.replace(/^http:/, "https:");
  if (!Array.isArray(value)) return "";
  const preferred = value.find((item) => /320|500/i.test(item.quality)) || value[value.length - 1];
  return (preferred?.url || "").replace(/^http:/, "https:");
}

function clean(value) {
  return String(value).replace(/&amp;/g, "&").replace(/&quot;/g, "\\"").replace(/&#039;/g, "'").trim();
}

function inferMoods(text) {
  const source = text.toLowerCase();
  const moods = [];
  if (/love|dil|romantic|pyaar|ishq/.test(source)) moods.push("romantic");
  if (/sad|alone|judai|dard|yaad|bewafa/.test(source)) moods.push("sad");
  if (/party|dance|beat|gabru|dj/.test(source)) moods.push("energetic");
  if (/90|retro|old/.test(source)) moods.push("nostalgic");
  return moods.length ? moods : ["late-night"];
}

function inferEnergy(raw) {
  const text = String(raw.name || raw.title || "") + " " + String(raw.album?.name || raw.album || "");
  if (/party|dance|dj|beat|remix/i.test(text)) return 0.86;
  if (/lofi|sad|ghazal|unplugged/i.test(text)) return 0.38;
  return 0.62;
}

function withLanguage(query, language) {
  const hint = LANGUAGE_HINTS[language];
  return hint && !query.toLowerCase().includes(hint) ? query + " " + hint : query;
}

function uniqueSongs(items) {
  const seen = new Set();
  return items.filter((song) => {
    const signature = (canonical(song.title) + " " + canonical(song.artist)).trim();
    const value = signature || song.id;
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function canonical(value) {
  return String(value || "").toLowerCase().replace(/\\([^)]*\\)/g, " ").replace(/\\bfrom\\b.+$/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function json(request, value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(request) }
  });
}

function corsHeaders(request) {
  return {
    "access-control-allow-origin": request.headers.get("origin") || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type,Accept"
  };
}
`);

try {
  await copyFile(path.join(root, "dist", "index.html"), path.join(serverDir, "index.html"));
} catch {
}
