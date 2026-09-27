export default function MusicControls({ playing, muted, volume, currentTime, duration, onTogglePlay, onNext, onPrevious, onShuffle, onMute, onVolume, onSeek, onOpenSearch }) {
  const seekMax = Number.isFinite(duration) && duration > 0 ? duration : 1;

  return (
    <div className="music-controls" aria-label="Music controls">
      <button className="search-button" onClick={onOpenSearch} title="Search music" aria-label="Search music">⌕</button>
      <button className="icon-button" onClick={onPrevious} title="Previous">◀</button>
      <button className="play-button" onClick={onTogglePlay}>{playing ? "PAUSE" : "PLAY"}</button>
      <button className="icon-button" onClick={onNext} title="Next">▶</button>
      <button className="icon-button" onClick={onShuffle} title="Shuffle">⤨</button>
      <button className="icon-button" onClick={onMute} title="Mute">{muted ? "MUTED" : "VOL"}</button>
      <input
        className="volume"
        aria-label="Volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(event) => onVolume(Number(event.target.value))}
      />
      <label className="track-progress">
        <span>{formatTime(currentTime)}</span>
        <input aria-label="Song position" type="range" min="0" max={seekMax} step="1" value={Math.min(currentTime || 0, seekMax)} disabled={!duration} onChange={(event) => onSeek(Number(event.target.value))} />
        <span>{formatTime(duration)}</span>
      </label>
    </div>
  );
}

function formatTime(value) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${Math.floor(value / 60)}:${seconds}`;
}
