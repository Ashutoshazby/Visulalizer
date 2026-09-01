import CryptoJS from "crypto-js";
import { MusicProvider } from "./MusicProvider.js";

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
  hindi: [
    "arijit singh", "kk songs", "jubin nautiyal", "vishal mishra", "mohit chauhan",
    "shreya ghoshal", "atif aslam", "pritam songs", "mithoon songs", "bollywood acoustic",
    "bollywood lofi", "hindi indie", "hindi songs 2024", "hindi songs 2023", "bollywood romantic",
    "bollywood sad", "hindi unplugged", "armaan malik", "sachet parampara", "amit trivedi"
  ],
  english: [
    "english chill drive", "english late night drive", "english romantic songs", "english sad songs",
    "english acoustic", "english pop hits", "weeknd", "ed sheeran", "taylor swift", "dua lipa",
    "coldplay", "lana del rey", "post malone", "one direction", "english road trip songs"
  ],
  punjabi: [
    "punjabi romantic", "punjabi chill", "punjabi sad", "punjabi drive", "ap dhillon",
    "diljit dosanjh", "satinder sartaaj", "amrinder gill", "b praak", "harrdy sandhu",
    "gurdas maan", "nimrat khaira"
  ],
  haryanvi: [
    "haryanvi songs", "haryanvi romantic", "haryanvi chill", "haryanvi latest", "haryanvi drive",
    "renuka panwar", "masoom sharma", "raj mawar", "vishvajeet choudhary"
  ],
  auto: [
    "arijit singh", "kk songs", "jubin nautiyal", "vishal mishra", "english chill drive",
    "english pop hits", "punjabi romantic", "haryanvi songs", "bollywood lofi", "hindi indie",
    "bollywood acoustic", "punjabi chill"
  ]
};

const LANGUAGE_HINTS = {
  hindi: "hindi",
  english: "english",
  punjabi: "punjabi",
  haryanvi: "haryanvi"
};

const ALWAYS_BLOCKED_TRACKS = [
  /\b(hanuman|chalisa|bhajan|aarti|mantra|bhakti|devotional|shiv|shiva|mahadev|krishna|radha|ram|rama|ganesh|ganpati|durga|mata|sai baba)\b/i
];

const MOOD_BLOCKED_TRACKS = {
  romantic: [
    /\b(sad|dard|bewafa|judai|judaai|tanha|tanhai|alone|breakup|heartbreak|rona|royi|yaad|yaadein|separation)\b/i
  ],
  chill: [
    /\b(chalisa|aarti|mantra|bhajan)\b/i
  ],
  "late-night": [
    /\b(chalisa|aarti|mantra|bhajan)\b/i
  ]
};

export function createJioSaavnProvider(config) {
  return new JioSaavnProvider(config);
}

class JioSaavnProvider extends MusicProvider {
  name = "jiosaavn-compatible";

  constructor({ baseUrl }) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async searchSongs({ query, language = "auto", limit = 12, page = 0 }) {
    if (!query.trim()) return [];
    const requestedQuery = this.withLanguage(query, language);
    const url = new URL(`${this.baseUrl}/api/search/songs`);
    url.searchParams.set("query", requestedQuery);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));

    try {
      const json = await this.fetchJson(url);
      const results = json?.data?.results || [];
      return results.map((song) => this.normalizeSong(song)).filter((song) => song.streamUrl);
    } catch {
      return this.searchNativeSongs({ query: requestedQuery, language, limit });
    }
  }

  async getSong(id) {
    if (!id) throw new Error("Missing song id.");
    try {
      const url = new URL(`${this.baseUrl}/api/songs/${encodeURIComponent(id)}`);
      const json = await this.fetchJson(url);
      const raw = Array.isArray(json?.data) ? json.data[0] : json?.data;
      const normalized = this.normalizeSong(raw);
      if (!normalized.id) throw new Error("Invalid song response.");
      if (isPreviewStream(normalized.streamUrl)) return this.getNativeSong(id);
      return normalized;
    } catch {
      return this.getNativeSong(id);
    }
  }

  getStreamUrl(song) {
    return song?.streamUrl || null;
  }

  getArtwork(song) {
    return song?.artwork || "";
  }

  async getRecommendations({ mood = "auto", language = "auto", limit = 18 }) {
    const pool = [];
    const discovery = DISCOVERY_QUERIES[language] || DISCOVERY_QUERIES.auto;
    const queries = shuffle([...(MOOD_QUERIES[mood] || MOOD_QUERIES.auto), ...discovery, ...MOOD_QUERIES.auto]);
    const pages = shuffle([0, 1, 2, 3, 4, 5]);
    const attempts = Math.min(16, queries.length);

    for (let i = 0; i < attempts && uniqueSongs(pool).length < limit * 1.25; i += 1) {
      const songs = await this.searchSongs({
        query: queries[i],
        language,
        limit: Math.ceil(limit / 2),
        page: pages[i % pages.length]
      });
      pool.push(...songs);
    }
    const cleanPool = uniqueSongs(pool).filter((song) => isRecommendationSafe(song));
    const moodPool = cleanPool.filter((song) => isMoodSafe(song, mood));
    return shuffle(moodPool.length ? moodPool : cleanPool).slice(0, limit);
  }

  withLanguage(query, language) {
    const hint = LANGUAGE_HINTS[language];
    return hint && !query.toLowerCase().includes(hint) ? `${query} ${hint}` : query;
  }

  normalizeSong(raw = {}) {
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
      moods: inferMoods(`${raw.name || raw.title || ""} ${raw.album?.name || raw.album || ""}`),
      nightDrive: 0.8,
      energy: inferEnergy(raw)
    };
  }

  async searchNativeSongs({ query, language = "auto", limit = 12 }) {
    const searchUrl = new URL("https://www.jiosaavn.com/api.php");
    searchUrl.searchParams.set("__call", "autocomplete.get");
    searchUrl.searchParams.set("_format", "json");
    searchUrl.searchParams.set("_marker", "0");
    searchUrl.searchParams.set("query", query);
    const json = await this.fetchJson(searchUrl);
    const hits = [...(json?.songs?.data || []), ...(json?.topquery?.data || [])]
      .filter((song) => song?.type === "song")
      .filter((song) => language === "auto" || language === "surprise" || song?.more_info?.language === language);
    const ids = uniqueBy(hits, "id").map((song) => song.id).slice(0, limit);
    const details = await Promise.allSettled(ids.map((id) => this.getNativeSong(id)));
    return details
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((song) => song.streamUrl);
  }

  async getNativeSong(id) {
    const detailUrl = new URL("https://www.jiosaavn.com/api.php");
    detailUrl.searchParams.set("__call", "song.getDetails");
    detailUrl.searchParams.set("_format", "json");
    detailUrl.searchParams.set("_marker", "0");
    detailUrl.searchParams.set("pids", id);
    const json = await this.fetchJson(detailUrl);
    const raw = json?.[id] || Object.values(json || {})[0];
    if (!raw) throw new Error("Native song detail was empty.");
    raw.media_url = decryptMediaUrl(raw.encrypted_media_url, raw["320kbps"] === "true") || raw.media_preview_url || raw.vlink;
    return this.normalizeSong(raw);
  }

  async fetchJson(url) {
    const response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "NightDriveRadio/1.0"
      }
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    const json = await response.json();
    if (json?.success === false) throw new Error(json?.message || "Provider request failed.");
    return json;
  }
}

function bestMedia(value) {
  if (!value) return "";
  if (typeof value === "string") return value.replace(/^http:/, "https:");
  if (!Array.isArray(value)) return "";
  const preferred = value.find((item) => /320|500/i.test(item.quality)) || value[value.length - 1];
  return (preferred?.url || "").replace(/^http:/, "https:");
}

function clean(value) {
  return String(value).replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#039;/g, "'").trim();
}

function decryptMediaUrl(encryptedMediaUrl, hasHighQuality) {
  if (!encryptedMediaUrl) return "";
  try {
    const key = CryptoJS.enc.Utf8.parse("38346591");
    const mediaUrl = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedMediaUrl) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    ).toString(CryptoJS.enc.Utf8);
    return (hasHighQuality ? mediaUrl.replace("_96.mp4", "_320.mp4") : mediaUrl).replace(/^http:/, "https:");
  } catch {
    return "";
  }
}

function isPreviewStream(url) {
  return /preview\.saavncdn\.com/i.test(String(url || ""));
}

function isRecommendationSafe(song) {
  const text = searchableSongText(song);
  return !ALWAYS_BLOCKED_TRACKS.some((pattern) => pattern.test(text));
}

function isMoodSafe(song, mood) {
  const text = searchableSongText(song);
  const blocked = MOOD_BLOCKED_TRACKS[mood] || [];
  if (blocked.some((pattern) => pattern.test(text))) return false;
  if (mood === "romantic" && song.moods?.includes("sad")) return false;
  return true;
}

function searchableSongText(song) {
  return `${song?.title || ""} ${song?.artist || ""} ${song?.album || ""}`.toLowerCase();
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
  const text = `${raw.name || raw.title || ""} ${raw.album?.name || raw.album || ""}`.toLowerCase();
  if (/party|dance|dj|beat|remix/.test(text)) return 0.86;
  if (/lofi|sad|ghazal|unplugged/.test(text)) return 0.38;
  return 0.62;
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function uniqueSongs(items) {
  const seen = new Set();
  return items.filter((song) => {
    const signature = `${canonical(song.title)} ${canonical(song.artist)}`.trim();
    const value = signature || song.id;
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function canonical(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bfrom\b.+$/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}
