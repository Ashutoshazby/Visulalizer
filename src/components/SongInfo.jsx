export default function SongInfo({ song, moodContext }) {
  return (
    <section className="song-info">
      <div className="current-artwork">{song?.artwork ? <img src={song.artwork} alt="" /> : <span>♪</span>}</div>
      <div className="current-copy">
        <p className="now-label">NOW PLAYING</p>
        <h1>{song?.title || "Finding a song..."}</h1>
        <p className="artist">{song?.artist || "A quiet song for sunset"}</p>
        <p className="meta">{capitalize(song?.language || moodContext.language)} • {capitalize(moodContext.mood)}</p>
      </div>
    </section>
  );
}

function capitalize(value) {
  return String(value || "").replace(/^\w/, (letter) => letter.toUpperCase());
}
