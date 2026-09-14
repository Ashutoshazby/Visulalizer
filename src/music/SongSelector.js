export function selectSong(songs, context, preferences) {
  const uniqueSongs = dedupeSongs(songs);
  const recentIds = new Set((preferences.recentlyPlayed || []).slice(0, 110));
  const freshSongs = uniqueSongs.filter((song) => !recentIds.has(song.id));
  const moodPool = freshSongs.filter((song) => isMoodAligned(song, context));
  const pool = moodPool.length >= Math.min(8, freshSongs.length)
    ? moodPool
    : freshSongs.length >= Math.min(12, uniqueSongs.length) ? freshSongs : leastRepeatedSongs(uniqueSongs, preferences);

  return weightedShuffle(
    pool.map((song) => ({ song, score: scoreSong(song, context, preferences) }))
  );
}

function dedupeSongs(songs) {
  const seen = new Set();
  return songs.filter((song) => {
    const signature = `${canonical(song.title)} ${canonical(song.artist)}`.trim();
    const key = signature || song.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
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

function scoreSong(song, context, preferences) {
  const moodMatch = song.moods?.includes(context.mood) ? 1 : context.tags.some((tag) => song.moods?.includes(tag)) ? 0.52 : 0.16;
  const languageMatch = context.language === "surprise" || context.language === "auto"
    ? preferences.languagePreferences?.[song.language] || 0.5
    : song.language === context.language ? 1 : 0.15;
  const timeMatch = context.phase === "late-night" ? song.nightDrive || 0.85 : 0.62;
  const recentIndex = (preferences.recentlyPlayed || []).indexOf(song.id);
  const recentPenalty = recentIndex === -1 ? 1 : Math.max(0.04, recentIndex / 70);
  const playCountPenalty = 1 / ((preferences.playCounts?.[song.id] || 0) + 1);
  const energyMatch = energyScore(song, context.mood);
  const randomness = 0.78 + Math.random() * 0.44;
  return (moodMatch * 0.42 + languageMatch * 0.18 + energyMatch * 0.16 + timeMatch * 0.08 + recentPenalty * 0.1 + playCountPenalty * 0.06) * randomness;
}

function isMoodAligned(song, context) {
  if (context.mood === "energetic") return song.energy >= 0.58 && song.moods?.includes("energetic");
  if (context.mood === "sad") return !song.moods?.includes("energetic") && song.energy <= 0.62;
  if (context.mood === "romantic") return !song.moods?.includes("sad") && !song.moods?.includes("energetic") && song.energy <= 0.68;
  return true;
}

function energyScore(song, mood) {
  if (mood === "energetic") return song.energy >= 0.68 ? 1 : song.energy >= 0.58 ? 0.72 : 0.08;
  if (mood === "sad") return song.energy <= 0.48 ? 1 : song.energy <= 0.62 ? 0.56 : 0.12;
  if (mood === "romantic") return song.energy >= 0.35 && song.energy <= 0.68 ? 1 : 0.28;
  if (mood === "chill" || mood === "late-night") return song.energy <= 0.7 ? 0.88 : 0.3;
  return 0.62;
}

function leastRepeatedSongs(songs, preferences) {
  const recent = preferences.recentlyPlayed || [];
  return [...songs]
    .sort((a, b) => {
      const aPlays = preferences.playCounts?.[a.id] || 0;
      const bPlays = preferences.playCounts?.[b.id] || 0;
      const aRecent = recent.includes(a.id) ? recent.indexOf(a.id) : Number.POSITIVE_INFINITY;
      const bRecent = recent.includes(b.id) ? recent.indexOf(b.id) : Number.POSITIVE_INFINITY;
      return aPlays - bPlays || bRecent - aRecent || Math.random() - 0.5;
    })
    .slice(0, Math.max(12, Math.ceil(songs.length * 0.5)));
}

function weightedShuffle(entries) {
  const queue = [...entries].sort(() => Math.random() - 0.5);
  const shuffled = [];

  while (queue.length) {
    const total = queue.reduce((sum, entry) => sum + Math.max(0.05, entry.score), 0);
    let cursor = Math.random() * total;
    const index = queue.findIndex((entry) => {
      cursor -= Math.max(0.05, entry.score);
      return cursor <= 0;
    });
    const [picked] = queue.splice(index === -1 ? queue.length - 1 : index, 1);
    shuffled.push(picked.song);
  }

  return shuffled;
}
