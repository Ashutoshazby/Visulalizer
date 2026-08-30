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
import { getRecommendations } from "./music/MusicProvider.js";
import { loadPreferences, recordPlay, recordSelection, savePreferences } from "./storage/UserPreferences.js";

const INITIAL_AUDIO = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };

export default function App() {
  const audioEngine = useRef(null);
  const audioRef = useRef(null);
  const playlistRef = useRef([]);
  const songIndexRef = useRef(-1);
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
    if (!nextSong?.streamUrl) {
      setStatus("That track did not expose a playable stream. Trying another road.");
      return;
    }
    setSong(nextSong);
    songIndexRef.current = nextIndex;
    const audio = audioRef.current;
    audio.src = nextSong.streamUrl;
    audio.crossOrigin = "anonymous";
    audio.volume = volume;
    audio.muted = muted;
    try {
      await audio.play();
      setPlaying(true);
      setStatus("");
      refreshPreferences(recordPlay(loadPreferences(), nextSong, moodContext));
    } catch {
      setPlaying(false);
      setStatus("Tap START DRIVE to let the browser unlock audio.");
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
      await playSong(ranked[firstIndex], firstIndex);
    } catch (error) {
      setStatus(`Music provider is unavailable: ${error.message}`);
    }
  }, [moodContext, playSong, preferences, song?.id]);

  const startDrive = useCallback(async () => {
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
    if (songIndexRef.current >= queue.length - 1) return loadDriveQueue();
    const nextIndex = songIndexRef.current + 1;
    await playSong(queue[nextIndex], nextIndex);
  }, [loadDriveQueue, playSong]);

  const previous = useCallback(async () => {
    const queue = playlistRef.current;
    if (!queue.length) return;
    const nextIndex = (songIndexRef.current - 1 + queue.length) % queue.length;
    await playSong(queue[nextIndex], nextIndex);
  }, [playSong]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!started) return startDrive();
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [startDrive, started]);

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
      <audio ref={audioRef} onEnded={next} onError={next} />
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
