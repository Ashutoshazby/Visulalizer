import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SunsetBeachScene from "./components/SunsetBeachScene.jsx";
import MusicControls from "./components/MusicControls.jsx";
import MusicSearch from "./components/MusicSearch.jsx";
import MoodSelector from "./components/MoodSelector.jsx";
import LanguageSelector from "./components/LanguageSelector.jsx";
import SongInfo from "./components/SongInfo.jsx";
import { getCurrentMood } from "./mood/MoodEngine.js";
import { selectSong } from "./music/SongSelector.js";
import { API_BASE, getRecommendations, getStreamUrl, searchSongs } from "./music/MusicProvider.js";
import { loadPreferences, recordPlay, recordSelection, savePreferences } from "./storage/UserPreferences.js";

const MAX_FAILED_SONGS = 5;

export default function App() {
  const audioRef = useRef(null);
  const playlistRef = useRef([]);
  const songIndexRef = useRef(-1);
  const failedSongIdsRef = useRef(new Set());
  const audioFailuresRef = useRef(0);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.78);
  const [song, setSong] = useState(null);
  const [status, setStatus] = useState("");
  const [preferences, setPreferences] = useState(() => loadPreferences());
  const [moodOverride, setMoodOverride] = useState("auto");
  const [languageOverride, setLanguageOverride] = useState("auto");
  const [fullscreen, setFullscreen] = useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const moodContext = useMemo(() => {
    return getCurrentMood(new Date(clockTick), preferences, moodOverride, languageOverride);
  }, [clockTick, preferences, moodOverride, languageOverride]);

  const refreshPreferences = useCallback((next) => {
    setPreferences(next);
    savePreferences(next);
  }, []);

  const playSong = useCallback(async (nextSong, nextIndex) => {
    if (!nextSong?.id) {
      setStatus("That track is missing a playable song id. Trying another song.");
      return false;
    }
    setSong(nextSong);
    setCurrentTime(0);
    setDuration(0);
    songIndexRef.current = nextIndex;
    const audio = audioRef.current;
    const streamEndpoint = getStreamUrl(nextSong);
    configureAudioForApi(audio);
    audio.volume = volume;
    audio.muted = muted;
    audio.preload = "auto";

    if (import.meta.env.DEV) {
      console.info("[Saanjh] selected song", {
        id: nextSong.id,
        title: nextSong.title,
        streamEndpoint,
        apiBase: API_BASE
      });
    }

    try {
      await loadAudioSource(audio, streamEndpoint);
      await audio.play();
      setPlaying(true);
      setStatus("");
      audioFailuresRef.current = 0;
      refreshPreferences(recordPlay(loadPreferences(), nextSong, moodContext));
      return true;
    } catch (error) {
      failedSongIdsRef.current.add(nextSong.id);
      audioFailuresRef.current += 1;
      setPlaying(false);
      logAudioError(audio, nextSong, streamEndpoint, error);
      setStatus(audioFailuresRef.current >= MAX_FAILED_SONGS
        ? "Several songs failed to stream. Please try again in a bit."
        : "That song could not stream. Trying another song.");
      return false;
    }
  }, [moodContext, muted, refreshPreferences, volume]);

  const loadMusicQueue = useCallback(async () => {
    setStatus("Finding something beautiful...");
    try {
      const candidates = await getRecommendations({
        mood: moodContext.mood,
        language: moodContext.language,
        limit: 42
      });
      if (!candidates.length) throw new Error("No songs found.");
      const latestPreferences = loadPreferences();
      const ranked = selectSong(candidates, moodContext, latestPreferences);
      const currentSongId = song?.id;
      const firstIndex = Math.max(0, ranked.findIndex((candidate) => candidate.id !== currentSongId));
      playlistRef.current = ranked;
      failedSongIdsRef.current.clear();
      for (let index = firstIndex; index < ranked.length; index += 1) {
        const played = await playSong(ranked[index], index);
        if (played) return;
        if (audioFailuresRef.current >= MAX_FAILED_SONGS) return;
      }
    } catch (error) {
      setStatus(`Music provider is unavailable: ${error.message}`);
    }
  }, [moodContext, playSong, preferences, song?.id]);

  const startListening = useCallback(async () => {
    configureAudioForApi(audioRef.current);
    setStarted(true);
    await loadMusicQueue();
  }, [loadMusicQueue]);

  const next = useCallback(async () => {
    const queue = playlistRef.current;
    if (!queue.length) return loadMusicQueue();
    for (let nextIndex = songIndexRef.current + 1; nextIndex < queue.length; nextIndex += 1) {
      if (failedSongIdsRef.current.has(queue[nextIndex]?.id)) continue;
      const played = await playSong(queue[nextIndex], nextIndex);
      if (played) return;
      if (audioFailuresRef.current >= MAX_FAILED_SONGS) return;
    }
    return loadMusicQueue();
  }, [loadMusicQueue, playSong]);

  const previous = useCallback(async () => {
    const queue = playlistRef.current;
    if (!queue.length) return;
    const nextIndex = (songIndexRef.current - 1 + queue.length) % queue.length;
    await playSong(queue[nextIndex], nextIndex);
  }, [playSong]);

  const handleAudioError = useCallback(async (event) => {
    const audio = audioRef.current;
    if (audio?.dataset.loadingSource === "true") return;
    const failedSong = playlistRef.current[songIndexRef.current];
    if (failedSong?.id) failedSongIdsRef.current.add(failedSong.id);
    audioFailuresRef.current += 1;
    logAudioError(audio, failedSong, audio?.currentSrc || audio?.src, event);

    if (audioFailuresRef.current >= MAX_FAILED_SONGS) {
      setPlaying(false);
      setStatus("Several songs failed to stream. Please try another mood or try again later.");
      return;
    }

    const queue = playlistRef.current;
    for (let nextIndex = songIndexRef.current + 1; nextIndex < queue.length; nextIndex += 1) {
      if (failedSongIdsRef.current.has(queue[nextIndex]?.id)) continue;
      const played = await playSong(queue[nextIndex], nextIndex);
      if (played) return;
    }

    await loadMusicQueue();
  }, [loadMusicQueue, playSong]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!started) return startListening();
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
        setStatus("");
      } catch (error) {
        setPlaying(false);
        logAudioError(audio, song, audio.currentSrc || audio.src, error);
        setStatus("Audio playback was blocked or failed. Tap play again in a moment.");
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [song, startListening, started]);

  const updateMood = (value) => {
    setMoodOverride(value);
    refreshPreferences(recordSelection(loadPreferences(), "mood", value));
  };

  const updateLanguage = (value) => {
    setLanguageOverride(value);
    refreshPreferences(recordSelection(loadPreferences(), "language", value));
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  const runSearch = async (event) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);
    setSearchError("");
    try {
      const results = await searchSongs({ query, language: languageOverride, limit: 24 });
      setSearchResults(results);
      if (!results.length) setSearchError("No songs found. Try a song or artist name.");
    } catch (error) {
      setSearchError(`Search failed: ${error.message}`);
    } finally {
      setSearching(false);
    }
  };

  const playSearchResult = async (selectedSong) => {
    const selectedIndex = searchResults.findIndex((item) => item.id === selectedSong.id);
    playlistRef.current = searchResults;
    failedSongIdsRef.current.clear();
    audioFailuresRef.current = 0;
    setSearchOpen(false);
    if (!started) {
      configureAudioForApi(audioRef.current);
      setStarted(true);
    }
    await playSong(selectedSong, Math.max(0, selectedIndex));
  };

  const seek = (value) => {
    if (!audioRef.current || !Number.isFinite(value)) return;
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (event.key.toLowerCase() === "n") next();
      if (event.key.toLowerCase() === "p") previous();
      if (event.key.toLowerCase() === "m") setMuted((value) => !value);
      if (event.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous, togglePlay]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted;
    }
  }, [muted, volume]);

  useEffect(() => {
    if (!started) return;
    loadMusicQueue();
  }, [moodOverride, languageOverride]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  return (
    <main className={`app mood-${moodContext.mood} phase-${moodContext.phase}`}>
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={next}
        onError={handleAudioError}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      />
      <SunsetBeachScene playing={playing} />
      <button className="fullscreen-button" onClick={toggleFullscreen} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
        {fullscreen ? "↙" : "⛶"}
      </button>
      <div className="music-shell">
        {!started ? (
          <section className="first-run">
            <p className="brand-kicker">MUSIC FOR SLOW EVENINGS</p>
            <h1>SAANJH</h1>
            <p>Hindi • Punjabi • English • Haryanvi</p>
            <button className="start-button" onClick={startListening}>ENTER</button>
            <small className="made-by">Made by Ashu</small>
            {status && <span className="status">{status}</span>}
          </section>
        ) : (
          <section className="player-layout">
            <header className="app-brand"><span>SAANJH</span><small>Made by Ashu</small></header>
            <div className="bottom-player">
              <SongInfo song={song} moodContext={moodContext} />
              <MusicControls
                playing={playing}
                muted={muted}
                volume={volume}
                currentTime={currentTime}
                duration={duration}
                onTogglePlay={togglePlay}
                onNext={next}
                onPrevious={previous}
                onShuffle={loadMusicQueue}
                onMute={() => setMuted((value) => !value)}
                onVolume={setVolume}
                onSeek={seek}
                onOpenSearch={() => setSearchOpen(true)}
              />
              <div className="selectors">
                <MoodSelector value={moodOverride} onChange={updateMood} />
                <LanguageSelector value={languageOverride} onChange={updateLanguage} />
              </div>
              {status && <span className="status">{status}</span>}
            </div>
          </section>
        )}
      </div>
      <MusicSearch
        open={searchOpen}
        query={searchQuery}
        results={searchResults}
        loading={searching}
        error={searchError}
        currentSongId={song?.id}
        onQuery={setSearchQuery}
        onSearch={runSearch}
        onSelect={playSearchResult}
        onClose={() => setSearchOpen(false)}
      />
    </main>
  );
}

function configureAudioForApi(audio) {
  if (!audio) return;
  const apiOrigin = new URL(API_BASE, window.location.origin).origin;
  if (apiOrigin === window.location.origin) {
    audio.removeAttribute("crossorigin");
    audio.crossOrigin = null;
    return;
  }
  audio.crossOrigin = "anonymous";
}

function loadAudioSource(audio, streamEndpoint) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error("Audio load timed out.")), 12000);

    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      delete audio.dataset.loadingSource;
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onCanPlay = () => finish();
    const onLoadedMetadata = () => {
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) finish();
    };
    const onError = () => finish(new Error(readMediaError(audio)));

    audio.dataset.loadingSource = "true";
    audio.pause();
    audio.addEventListener("canplay", onCanPlay, { once: true });
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("error", onError, { once: true });
    audio.src = streamEndpoint;
    audio.load();
  });
}

function logAudioError(audio, song, streamEndpoint, errorEvent) {
  const details = {
    songId: song?.id,
    title: song?.title,
    streamEndpoint,
    readyState: audio?.readyState,
    networkState: audio?.networkState,
    mediaError: readMediaError(audio),
    eventType: errorEvent?.type,
    error: errorEvent instanceof Error ? errorEvent.message : undefined
  };
  console.warn("[Saanjh] audio error", details);
}

function readMediaError(audio) {
  const error = audio?.error;
  if (!error) return "No media error reported.";
  const labels = {
    1: "MEDIA_ERR_ABORTED",
    2: "MEDIA_ERR_NETWORK",
    3: "MEDIA_ERR_DECODE",
    4: "MEDIA_ERR_SRC_NOT_SUPPORTED"
  };
  return `${labels[error.code] || `MEDIA_ERR_${error.code}`}${error.message ? `: ${error.message}` : ""}`;
}
