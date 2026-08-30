export default function MusicControls({ playing, muted, volume, visualSpeed, onTogglePlay, onNext, onPrevious, onShuffle, onMute, onVolume, onVisualSpeed }) {
  const setSpeed = (value) => onVisualSpeed(Math.max(0.55, Math.min(1.65, value)));

  return (
    <div className="music-controls" aria-label="Music controls">
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
      <label className="speed-control">
        <button type="button" className="mini-button" onClick={() => setSpeed(visualSpeed - 0.1)} aria-label="Reduce drive speed">-</button>
        <span>{Math.round(visualSpeed * 100)}%</span>
        <input
          aria-label="Drive speed"
          type="range"
          min="0.55"
          max="1.65"
          step="0.01"
          value={visualSpeed}
          onChange={(event) => setSpeed(Number(event.target.value))}
        />
        <button type="button" className="mini-button" onClick={() => setSpeed(visualSpeed + 0.1)} aria-label="Increase drive speed">+</button>
      </label>
    </div>
  );
}
