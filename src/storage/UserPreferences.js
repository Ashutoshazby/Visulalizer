const KEY = "night-drive-radio-preferences";

const defaults = {
  languagePreferences: { hindi: 0.62, punjabi: 0.26, haryanvi: 0.12 },
  moodPreferences: { romantic: 0.28, sad: 0.18, chill: 0.22, "late-night": 0.32 },
  recentlyPlayed: [],
  skippedSongs: [],
  playCounts: {}
};

export function loadPreferences() {
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences) {
  localStorage.setItem(KEY, JSON.stringify(preferences));
}

export function recordPlay(preferences, song, context) {
  const next = structuredClone(preferences);
  next.recentlyPlayed = [song.id, ...(next.recentlyPlayed || []).filter((id) => id !== song.id)].slice(0, 120);
  next.playCounts[song.id] = (next.playCounts[song.id] || 0) + 1;
  bump(next.languagePreferences, song.language, 0.03);
  bump(next.moodPreferences, context.mood, 0.02);
  return next;
}

export function recordSelection(preferences, type, value) {
  if (value === "auto" || value === "surprise") return preferences;
  const next = structuredClone(preferences);
  bump(type === "language" ? next.languagePreferences : next.moodPreferences, value, 0.05);
  return next;
}

function bump(map, key, amount) {
  map[key] = Math.min(1, (map[key] || 0) + amount);
}
