import { timeRules } from "./TimeRules.js";

const moodMap = {
  auto: null,
  romantic: { tags: ["romantic", "warm"], speed: 72 },
  sad: { tags: ["sad", "rain", "emotional"], speed: 58 },
  "late-night": { tags: ["late-night", "deep"], speed: 74 },
  nostalgic: { tags: ["90s", "film-grain"], speed: 66 },
  highway: { tags: ["highway", "desi-drive"], speed: 92 },
  energetic: { tags: ["energetic", "fast"], speed: 104 },
  chill: { tags: ["chill", "soft"], speed: 64 }
};

const messages = {
  morning: ["The city is still stretching awake.", "A softer road for a softer hour."],
  day: ["Clear lanes, easy rhythm.", "Let the daylight carry the beat."],
  evening: ["Let's take the long way home.", "The lights are starting to remember us."],
  night: ["Tonight feels different.", "Windows down in another universe."],
  "late-night": ["Some roads are better at night.", "No rush. Just the line ahead."]
};

export function getCurrentMood(date, preferences, moodOverride = "auto", languageOverride = "auto") {
  const hour = date.getHours() + date.getMinutes() / 60;
  const rule = timeRules.find((item) => hour >= item.start && hour < item.end) || timeRules[0];
  const override = moodMap[moodOverride];
  const preferredLanguage = pickLanguage(preferences, languageOverride);
  return {
    mood: override ? moodOverride : rule.mood,
    intensity: override ? Math.max(rule.intensity, 0.66) : rule.intensity,
    language: preferredLanguage,
    preferredLanguages: preferredLanguage === "auto" ? ["hindi", "punjabi", "haryanvi"] : [preferredLanguage],
    phase: rule.phase,
    tags: override ? [...new Set([...override.tags, ...rule.tags])] : rule.tags,
    speed: override?.speed || rule.speed
  };
}

export function getTimeMessage(date) {
  const phase = (timeRules.find((item) => {
    const hour = date.getHours() + date.getMinutes() / 60;
    return hour >= item.start && hour < item.end;
  }) || timeRules[0]).phase;
  const options = messages[phase] || messages.night;
  const key = Math.floor((date.getDate() + date.getHours()) % options.length);
  return options[key];
}

function pickLanguage(preferences, override) {
  if (override === "surprise") return ["hindi", "punjabi", "haryanvi"][Math.floor(Math.random() * 3)];
  if (override !== "auto") return override;
  const entries = Object.entries(preferences.languagePreferences || {});
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] || "hindi";
}
