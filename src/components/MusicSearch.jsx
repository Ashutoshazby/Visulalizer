import { useEffect, useRef } from "react";

export default function MusicSearch({ open, query, results, loading, error, currentSongId, onQuery, onSearch, onSelect, onClose }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  if (!open) return null;

  return (
    <section className="music-search" aria-label="Search music">
      <div className="search-heading">
        <div>
          <span className="search-kicker">FIND A TRACK</span>
          <h2>Search music</h2>
        </div>
        <button className="search-close" type="button" onClick={onClose} aria-label="Close search">×</button>
      </div>
      <form className="search-form" onSubmit={onSearch}>
        <input ref={inputRef} type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Song, artist or album" aria-label="Search by song, artist or album" />
        <button type="submit" disabled={loading || !query.trim()}>{loading ? "SEARCHING" : "SEARCH"}</button>
      </form>
      {error && <p className="search-message">{error}</p>}
      {!error && !loading && results.length === 0 && <p className="search-message">Search anything and tap a song to play it.</p>}
      <div className="search-results">
        {results.map((item) => (
          <button className={`search-result ${item.id === currentSongId ? "is-playing" : ""}`} type="button" key={item.id} onClick={() => onSelect(item)}>
            <span className="result-artwork">{item.artwork ? <img src={item.artwork} alt="" /> : <span>♪</span>}</span>
            <span className="result-copy"><strong>{item.title}</strong><small>{item.artist || item.album || "Unknown artist"}</small></span>
            <span className="result-action">{item.id === currentSongId ? "NOW" : "PLAY"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
