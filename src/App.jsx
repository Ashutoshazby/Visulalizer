import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DrivingScene from "./components/DrivingScene.jsx";
import MusicControls from "./components/MusicControls.jsx";
import MoodSelector from "./components/MoodSelector.jsx";
import LanguageSelector from "./components/LanguageSelector.jsx";
import SongInfo from "./components/SongInfo.jsx";
import TimeDisplay from "./components/TimeDisplay.jsx";
import { AudioEngine } from "./audio/AudioEngine.js";
import { getCurrentMood, getTimeMessage } from "./mood/MoodEngine.js";
import { selectSong } from "./music/SongSelector.js";
import { API_BASE, getRecommendations, getStreamUrl } from "./music/MusicProvider.js";
import { loadPreferences, recordPlay, recordSelection, savePreferences } from "./storage/UserPreferences.js";

const INITIAL_AUDIO = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
const MAX_FAILED_SONGS = 5;

export default function App() {
  const audioEngine = useRef(null);
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
  const [audioData, setAudioData] = useState(INITIAL_AUDIO);
  const [status, setStatus] = useState("");
  const [preferences, setPreferences] = useState(() => loadPreferences());
  const [moodOverride, setMoodOverride] = useState("auto");
  const [languageOverride, setLanguageOverride] = useState("auto");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [visualSpeed, setVisualSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  const moodContext = useMemo(() => {
    return getCurrentMood(new Date(), preferences, moodOverride, languageOverride);
  }, [preferences, moodOverride, languageOverride]);

  const timeMessage = useMemo(() => getTimeMessage(new Date()), [started, song?.id]);

  const refreshPreferences = useCallback((next) => {
    setPreferences(next);
    savePreferences(next);
  }, []);

  const playSong = useCallback(async (nextSong, nextIndex) => {
    if (!nextSong?.id) {
      setStatus("That track is missing a playable song id. Trying another road.");
      return false;
    }
    setSong(nextSong);
    songIndexRef.current = nextIndex;
    const audio = audioRef.current;
    const streamEndpoint = getStreamUrl(nextSong);
    configureAudioForApi(audio);
    audio.volume = volume;
    audio.muted = muted;
    audio.preload = "auto";

    if (import.meta.env.DEV) {
      console.info("[NightDrive] selected song", {
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
        : "That song could not stream. Trying another road song.");
      return false;
    }
  }, [moodContext, muted, refreshPreferences, volume]);

  const loadDriveQueue = useCallback(async () => {
    setStatus("Finding the road song...");
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

  const startDrive = useCallback(async () => {
    configureAudioForApi(audioRef.current);
    if (!audioEngine.current) {
      audioEngine.current = new AudioEngine(audioRef.current, setAudioData);
    }
    await audioEngine.current.resume();
    setStarted(true);
    await loadDriveQueue();
  }, [loadDriveQueue]);

  const next = useCallback(async () => {
    const queue = playlistRef.current;
    if (!queue.length) return loadDriveQueue();
    for (let nextIndex = songIndexRef.current + 1; nextIndex < queue.length; nextIndex += 1) {
      if (failedSongIdsRef.current.has(queue[nextIndex]?.id)) continue;
      const played = await playSong(queue[nextIndex], nextIndex);
      if (played) return;
      if (audioFailuresRef.current >= MAX_FAILED_SONGS) return;
    }
    return loadDriveQueue();
  }, [loadDriveQueue, playSong]);

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

    await loadDriveQueue();
  }, [loadDriveQueue, playSong]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!started) return startDrive();
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
  }, [song, startDrive, started]);

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
    loadDriveQueue();
  }, [moodOverride, languageOverride]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    let timer;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), 3800);
    };
    window.addEventListener("mousemove", show);
    window.addEventListener("touchstart", show);
    show();
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
    };
  }, []);

  return (
    <main className={`app mood-${moodContext.mood} phase-${moodContext.phase}`}>
      <audio ref={audioRef} preload="auto" onEnded={next} onError={handleAudioError} />
      <DrivingScene audioData={audioData} moodContext={moodContext} song={song} playing={playing} visualSpeed={visualSpeed} />
      <button className="fullscreen-button" onClick={toggleFullscreen} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
        {fullscreen ? "↙" : "⛶"}
      </button>
      <div className="cockpit">
        <TimeDisplay context={moodContext} message={timeMessage} />
        {!started ? (
          <section className="first-run">
            <h1>READY FOR A DRIVE?</h1>
            <p>Hindi • Punjabi • Haryanvi</p>
            <button className="start-button" onClick={startDrive}>START DRIVE</button>
            {status && <span className="status">{status}</span>}
          </section>
        ) : (
          <>
            <div className={`bottom-player ${controlsVisible ? "is-visible" : ""}`}>
              <SongInfo song={song} moodContext={moodContext} speed={(moodContext.speed + Math.round(audioData.beat * 18)) * visualSpeed} />
              <MusicControls
                playing={playing}
                muted={muted}
                volume={volume}
                visualSpeed={visualSpeed}
                onTogglePlay={togglePlay}
                onNext={next}
                onPrevious={previous}
                onShuffle={loadDriveQueue}
                onMute={() => setMuted((value) => !value)}
                onVolume={setVolume}
                onVisualSpeed={setVisualSpeed}
              />
              <div className="selectors">
                <MoodSelector value={moodOverride} onChange={updateMood} />
                <LanguageSelector value={languageOverride} onChange={updateLanguage} />
              </div>
              {status && <span className="status">{status}</span>}
            </div>
          </>
        )}
      </div>
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
  console.warn("[NightDrive] audio error", details);
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
