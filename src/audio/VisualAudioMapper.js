export function mapAudioToScene(audioData, moodContext, reducedMotion) {
  const motion = reducedMotion ? 0.25 : 1;
  return {
    roadSpeed: (0.9 + moodContext.speed / 110 + audioData.beat * 0.8) * motion,
    glow: 0.35 + audioData.bass * 0.8,
    buildingActivity: 0.2 + audioData.mid * 0.75,
    reflections: 0.18 + audioData.treble * 0.9,
    cameraShake: audioData.beat * 3 * motion,
    rain: moodContext.tags.includes("rain") ? 0.9 : moodContext.mood === "romantic" ? 0.22 : 0.08,
    grain: moodContext.mood === "nostalgic" ? 0.22 : 0.08
  };
}
