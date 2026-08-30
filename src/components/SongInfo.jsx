export default function SongInfo({ song, moodContext, speed }) {
  const clampedSpeed = Math.max(40, Math.min(190, Math.round(speed)));
  const needle = -118 + ((clampedSpeed - 40) / 150) * 236;

  return (
    <section className="song-info">
      <p className="drive-label">{labelForMood(moodContext.mood)}</p>
      <h1>{song?.title || "Finding a song..."}</h1>
      <p className="artist">{song?.artist || "Tuning the night road"}</p>
      <p className="meta">{capitalize(song?.language || moodContext.language)} • {capitalize(moodContext.mood)}</p>
      <div className="speedometer" aria-label={`Visual speed ${clampedSpeed} kilometers per hour`}>
        <svg viewBox="0 0 160 92" role="img">
          <path className="speed-arc base" d="M24 76 A56 56 0 0 1 136 76" />
          <path className="speed-arc live" d="M24 76 A56 56 0 0 1 136 76" style={{ strokeDashoffset: 176 - ((clampedSpeed - 40) / 150) * 176 }} />
          <g className="needle" style={{ transform: `rotate(${needle}deg)` }}>
            <line x1="80" y1="76" x2="80" y2="25" />
            <circle cx="80" cy="76" r="5" />
          </g>
          <text x="80" y="69" textAnchor="middle">{clampedSpeed}</text>
        </svg>
        <span className="speed-unit">km/h</span>
      </div>
    </section>
  );
}

function labelForMood(mood) {
  return {
    romantic: "WARM CITY DRIVE",
    sad: "EMPTY ROAD DRIVE",
    "late-night": "LATE NIGHT DRIVE",
    nostalgic: "RETRO NIGHT DRIVE",
    highway: "HIGHWAY DRIVE",
    energetic: "FAST LANE DRIVE",
    chill: "SOFT DRIVE"
  }[mood] || "AUTO DRIVE";
}

function capitalize(value) {
  return String(value || "").replace(/^\w/, (letter) => letter.toUpperCase());
}
