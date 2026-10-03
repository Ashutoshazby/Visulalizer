import CryptoJS from "crypto-js";
import { MusicProvider } from "./MusicProvider.js";

const MOOD_QUERIES = {
  romantic: ["romantic hindi", "punjabi romantic", "love songs hindi", "arijit love", "atif aslam romantic", "bollywood love songs", "jubin nautiyal romantic", "vishal mishra love", "hindi romantic hits", "bollywood romantic hits", "romantic armaan malik", "romantic kk"],
  sad: ["sad hindi songs", "punjabi sad songs", "emotional hindi", "arijit sad", "kk sad songs", "atif sad songs", "jubin sad", "vishal mishra sad", "hindi heartbreak songs", "bollywood sad hits", "emotional arijit", "sad kk"],
  "late-night": ["late night hindi", "lofi hindi", "arijit night", "kk unplugged", "bollywood chill night", "hindi acoustic", "mohit chauhan unplugged", "jubin nautiyal acoustic", "vishal mishra lofi", "atif aslam unplugged"],
  nostalgic: ["90s hindi songs", "old punjabi songs", "kumar sanu", "udit narayan", "alka yagnik", "sonu nigam old"],
  highway: ["drive songs hindi", "punjabi highway", "desi drive", "bollywood road trip", "hindi travel songs", "punjabi drive"],
  energetic: ["punjabi party", "haryanvi energetic", "bollywood dance", "hindi party songs", "punjabi beat", "haryanvi dance"],
  chill: ["hindi chill", "punjabi chill", "lofi bollywood", "hindi acoustic", "soft bollywood", "indie hindi", "prateek kuhad", "anuv jain"],
  auto: ["hindi hits", "punjabi hits", "haryanvi songs", "bollywood hits", "arijit singh", "kk songs"]
};

const MOOD_QUERY_MARKERS = {
  romantic: /\b(romantic|love|arijit love|atif aslam romantic|jubin nautiyal romantic|vishal mishra love)\b/i,
  sad: /\b(sad|emotional|arijit sad|kk sad|atif sad|jubin sad|vishal mishra sad)\b/i,
  "late-night": /\b(late night|lofi|night|unplugged|acoustic)\b/i,
  nostalgic: /\b(90s|old|kumar sanu|udit narayan|alka yagnik|sonu nigam old)\b/i,
  highway: /\b(drive|highway|road trip|travel)\b/i,
  energetic: /\b(party|dance|beat|energetic|workout|gym)\b/i,
  chill: /\b(chill|lofi|acoustic|soft|indie|prateek kuhad|anuv jain)\b/i
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
  /\b(hanuman|hanumanji|chalisa|bhajan|aarti|mantra|bhakti|devotional|shiv|shiva|mahadev|mahakal|mahakaal|bhole|bholenath|krishna|radha|ram|rama|ganesh|ganpati|durga|mata|sai baba)\b/i
];

const MOOD_BLOCKED_TRACKS = {
  romantic: [
    /\b(sad|dard|bewafa|judai|judaai|tanha|tanhai|alone|breakup|heartbreak|rona|royi|yaad|yaadein|separation|party|dance|dj|bass boosted|remix)\b/i
  ],
  sad: [
    /\b(party|dance|dj|club|banger|energetic|workout|gym|beat|bass boosted)\b/i
  ],
  energetic: [
    /\b(sad|dard|bewafa|judai|judaai|tanha|tanhai|alone|breakup|heartbreak|rona|royi|yaad|yaadein|ghazal|unplugged|acoustic|lofi|lo-fi|slow|sleep|soft|romantic mashup)\b/i
  ],
  chill: [
    /\b(chalisa|aarti|mantra|bhajan|party|club|banger|bass boosted)\b/i
  ],
  "late-night": [
    /\b(chalisa|aarti|mantra|bhajan|party|club|banger|bass boosted)\b/i
  ],
  highway: [
    /\b(chalisa|aarti|mantra|bhajan|ghazal|sleep)\b/i
  ]
};

const NOSTALGIC_TRACKS = [
  /\b(90s|90's|nineties|retro|old hindi|old punjabi|old songs|old is gold|kumar sanu|udit narayan|alka yagnik)\b/i
];

export function createJioSaavnProvider(config) {
  return new JioSaavnProvider(config);
}

class JioSaavnProvider extends MusicProvider {
  name = "jiosaavn-compatible";

  constructor({ baseUrl, maxRecommendationAttempts = 16, nativeDetailLimit = 12 }) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.maxRecommendationAttempts = maxRecommendationAttempts;
    this.nativeDetailLimit = nativeDetailLimit;
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

  async searchCatalog({ query, language = "auto", limit = 12 }) {
    if (!query.trim()) return { songs: [], playlists: [] };
    const requestedQuery = this.withLanguage(normalizeQuery(query), language);
    const autocompleteUrl = new URL("https://www.jiosaavn.com/api.php");
    autocompleteUrl.searchParams.set("__call", "autocomplete.get");
    autocompleteUrl.searchParams.set("_format", "json");
    autocompleteUrl.searchParams.set("_marker", "0");
    autocompleteUrl.searchParams.set("query", requestedQuery);

    let [compatibleSongs, autocomplete] = await Promise.all([
      this.searchSongs({ query: requestedQuery, language: "auto", limit }),
      this.fetchJson(autocompleteUrl).catch(() => ({}))
    ]);
    const hits = [...(autocomplete?.songs?.data || []), ...(autocomplete?.topquery?.data || [])]
      .filter((item) => item?.type === "song");
    const ids = uniqueBy(hits, "id").map((item) => item.id).slice(0, Math.min(4, this.nativeDetailLimit));
    const nativeDetails = await Promise.allSettled(ids.map((id) => this.getNativeSong(id)));
    const nativeSongs = nativeDetails
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const lyricQuery = lyricFallbackQuery(query);
    if (compatibleSongs.length < 5 && lyricQuery && canonical(lyricQuery) !== canonical(query)) {
      const lyricMatches = await this.searchSongs({ query: lyricQuery, language, limit });
      compatibleSongs = uniqueSongs([...compatibleSongs, ...lyricMatches]);
    }
    const suggestedArtist = closestArtist(query, [...nativeSongs, ...compatibleSongs]);
    if (!(autocomplete?.playlists?.data || []).length && suggestedArtist) {
      autocompleteUrl.searchParams.set("query", suggestedArtist);
      autocomplete = await this.fetchJson(autocompleteUrl).catch(() => autocomplete);
    }
    const playlists = (autocomplete?.playlists?.data || []).slice(0, 8).map((item) => ({
      id: String(item.id || ""),
      title: clean(item.title || "Playlist"),
      subtitle: clean(item.description || item.extra || "JioSaavn playlist"),
      artwork: bestArtwork(item.image),
      language: String(item.language || "").toLowerCase()
    })).filter((item) => item.id);
    return { songs: uniqueSongs([...nativeSongs, ...compatibleSongs]).slice(0, limit), playlists };
  }

  async getPlaylist(id, limit = 30) {
    if (!id) throw new Error("Missing playlist id.");
    const url = new URL("https://www.jiosaavn.com/api.php");
    url.searchParams.set("__call", "playlist.getDetails");
    url.searchParams.set("_format", "json");
    url.searchParams.set("_marker", "0");
    url.searchParams.set("listid", id);
    url.searchParams.set("p", "1");
    url.searchParams.set("n", String(Math.min(40, limit)));
    const data = await this.fetchJson(url);
    const songs = (data?.songs || []).map((song) => {
      song.media_url = decryptMediaUrl(song.encrypted_media_url, song["320kbps"] === "true") || song.media_preview_url || song.vlink;
      return this.normalizeSong(song);
    }).filter((song) => song.id && song.streamUrl).slice(0, limit);
    return {
      playlist: {
        id: String(data?.listid || id),
        title: clean(data?.listname || "Playlist"),
        subtitle: clean(data?.firstname || "JioSaavn playlist"),
        artwork: bestArtwork(data?.image),
        songCount: songs.length
      },
      songs
    };
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
    const baseQueries = mood === "auto"
      ? [...MOOD_QUERIES.auto, ...discovery]
      : [...(MOOD_QUERIES[mood] || discovery)];
    const queries = shuffle(baseQueries);
    const pages = shuffle([0, 1, 2, 3, 4, 5]);
    const attempts = Math.min(this.maxRecommendationAttempts, queries.length);

    for (let i = 0; i < attempts && uniqueSongs(pool).length < limit * 1.25; i += 1) {
      const query = queries[i];
      const songs = await this.searchSongs({
        query,
        language,
        limit: Math.ceil(limit / 2),
        page: pages[i % pages.length]
      });
      pool.push(...songs.map((song) => tagSongFromQuery(song, mood, query)));
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
    const ids = uniqueBy(hits, "id").map((song) => song.id).slice(0, Math.min(limit, this.nativeDetailLimit));
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

function bestArtwork(value) {
  return String(value || "").replace(/-(50|150)x\1(?=\.[a-z]+(?:\?|$))/i, "-500x500").replace(/^http:/, "https:");
}

function normalizeQuery(value) {
  return String(value || "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
}

function lyricFallbackQuery(value) {
  const words = normalizeQuery(value).split(" ").filter(Boolean);
  if (words.length < 4) return "";
  const stopWords = new Set(["hai", "hain", "ho", "ke", "ki", "ka", "ko", "se", "mein", "me", "main", "aur", "the", "a", "an", "is", "to", "of", "in", "my", "your"]);
  const useful = words.filter((word) => !stopWords.has(word.toLowerCase()));
  return (useful.length >= 3 ? useful : words).slice(0, 6).join(" ");
}

function closestArtist(query, songs) {
  const needle = canonical(query);
  if (!needle || needle.includes(" ")) return "";
  const candidates = songs.flatMap((song) => String(song.artist || "").split(",")).map((name) => name.trim()).filter(Boolean);
  let best = { name: "", score: Infinity };
  for (const name of candidates) {
    const firstName = canonical(name).split(" ")[0];
    const score = editDistance(needle, firstName);
    if (score < best.score) best = { name, score };
  }
  return best.score <= Math.max(1, Math.floor(needle.length * 0.3)) ? best.name : "";
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[right.length];
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
  if (mood === "energetic" && (song.moods?.includes("sad") || song.moods?.includes("romantic") || !song.moods?.includes("energetic") || song.energy < 0.58)) return false;
  if (mood === "sad" && (song.moods?.includes("energetic") || song.energy > 0.68)) return false;
  if (mood === "romantic" && song.energy > 0.72) return false;
  if (mood !== "nostalgic" && isNostalgicTrack(song, text)) return false;
  return true;
}

function tagSongFromQuery(song, requestedMood, query) {
  if (requestedMood === "auto") return song;
  const marker = MOOD_QUERY_MARKERS[requestedMood];
  if (!marker?.test(query)) return song;
  const moods = new Set(song.moods || []);
  moods.add(requestedMood);
  return {
    ...song,
    moods: [...moods],
    energy: adjustedEnergy(song.energy, requestedMood)
  };
}

function adjustedEnergy(energy, mood) {
  if (mood === "energetic") return Math.max(energy || 0, 0.78);
  if (mood === "sad") return Math.min(energy || 0.5, 0.42);
  if (mood === "romantic") return Math.min(Math.max(energy || 0.5, 0.42), 0.62);
  if (mood === "chill" || mood === "late-night") return Math.min(energy || 0.5, 0.58);
  return energy;
}

function searchableSongText(song) {
  return `${song?.title || ""} ${song?.artist || ""} ${song?.album || ""}`.toLowerCase();
}

function isNostalgicTrack(song, text = searchableSongText(song)) {
  const year = Number(song?.year);
  if (year >= 1980 && year <= 1999) return true;
  return NOSTALGIC_TRACKS.some((pattern) => pattern.test(text));
}

function inferMoods(text) {
  const source = text.toLowerCase();
  const moods = [];
  if (/sad|alone|judai|judaai|dard|bewafa|breakup|heartbreak|tanha|tanhai|rona|royi/.test(source)) moods.push("sad");
  if (/party|dance|club|banger|beat|gabru|dj|workout|gym|bass|energetic/.test(source)) moods.push("energetic");
  if (/love|romantic|pyaar|ishq|soulmate|saathiya|labon|tera mera|jaan ban|sajde/.test(source) && !moods.includes("sad")) moods.push("romantic");
  if (/90|retro|old/.test(source)) moods.push("nostalgic");
  return moods.length ? moods : ["late-night"];
}

function inferEnergy(raw) {
  const text = `${raw.name || raw.title || ""} ${raw.album?.name || raw.album || ""}`.toLowerCase();
  if (/party|dance|dj|beat|remix|club|banger|bass|workout|gym/.test(text)) return 0.9;
  if (/lofi|lo-fi|sad|ghazal|unplugged|acoustic|slow|sleep/.test(text)) return 0.32;
  if (/romantic|love|pyaar|ishq|soulmate/.test(text)) return 0.48;
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
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
