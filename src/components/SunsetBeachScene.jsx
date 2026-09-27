export default function SunsetBeachScene({ playing }) {
  return (
    <div className={`sunset-scene ${playing ? "is-playing" : ""}`} aria-hidden="true">
      <div className="sunset-image" />
      <div className="sunset-shade" />
      <div className="wave wave-far" />
      <div className="wave wave-near" />
      <div className="shore-glow" />
    </div>
  );
}
