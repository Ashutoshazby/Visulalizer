import * as FileSystem from "expo-file-system/legacy";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, AppState, BackHandler, Easing, FlatList, Image, ImageBackground, Keyboard, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Event, RepeatMode as NativeRepeatMode, State, usePlaybackState, useProgress, useTrackPlayerEvents } from "react-native-track-player";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || "https://saanjh-music-api.night-drive-radio.workers.dev";
const PROFILE_FILE = `${FileSystem.documentDirectory ?? "file:///"}saanjh-profile.json`;
const PLAYER_STATE_FILE = `${FileSystem.documentDirectory ?? "file:///"}saanjh-player-state.json`;

type Song = { id: string; title: string; artist?: string; album?: string; language?: string; artwork?: string };
type Playlist = { id: string; title: string; subtitle?: string; artwork?: string; songCount?: number };
type TabKey = "home" | "library";
type RepeatMode = "off" | "all" | "one";
type Quality = "low" | "standard" | "high";
type PrivatePlaylist = { id: string; name: string; songs: Song[] };
type LyricLine = { time: number; text: string };

let playerSetupPromise: Promise<void> | null = null;

function ensurePlayer() {
  if (!playerSetupPromise) {
    playerSetupPromise = TrackPlayer.setupPlayer({ waitForBuffer: true }).then(() => TrackPlayer.updateOptions({
      android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
      capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
      notificationCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
      compactCapabilities: [Capability.SkipToPrevious, Capability.Play, Capability.Pause, Capability.SkipToNext],
      progressUpdateEventInterval: 1,
    }));
  }
  return playerSetupPromise;
}

export default function App() {
  const [playerReady, setPlayerReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [startupAttempt, setStartupAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    setStartupError("");
    void ensurePlayer()
      .then(() => { if (mounted) setPlayerReady(true); })
      .catch((error) => {
        console.error("Audio player setup failed", error);
        playerSetupPromise = null;
        if (mounted) setStartupError("Audio service could not start.");
      });
    return () => { mounted = false; };
  }, [startupAttempt]);

  if (!playerReady) {
    return (
      <View style={styles.startupGate}>
        <Image source={require("./assets/saanjh-logo.png")} style={styles.startupLogo} />
        {startupError ? <><Text style={styles.startupError}>{startupError}</Text><Pressable style={styles.startupRetry} onPress={() => setStartupAttempt((value) => value + 1)}><Text style={styles.startupRetryText}>Retry</Text></Pressable></> : <ActivityIndicator color="#f3a675" />}
      </View>
    );
  }

  return <PlayerExperience />;
}

function PlayerExperience() {
  const nativePlayback = usePlaybackState();
  const progress = useProgress(500);
  const playback = {
    playing: nativePlayback.state === State.Playing,
    isBuffering: nativePlayback.state === State.Buffering || nativePlayback.state === State.Loading,
    currentTime: progress.position,
    duration: progress.duration,
    error: nativePlayback.state === State.Error ? "Playback failed" : "",
  };
  const queueRef = useRef<Song[]>([]);
  const indexRef = useRef(-1);
  const progressWidth = useRef(1);
  const finishedSongRef = useRef<string | null>(null);
  const resumeRequestedRef = useRef(false);
  const currentSongRef = useRef<Song | null>(null);
  const playbackPlayingRef = useRef(false);
  const activeTabRef = useRef<TabKey>("home");
  const selectedUserRef = useRef<string | null>(null);
  const profileModalRef = useRef(false);
  const profileMenuRef = useRef(false);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>("off");
  const searchRequestRef = useRef(0);
  const nowPlayingRef = useRef(false);
  const songMenuRef = useRef(false);
  const swipeStartRef = useRef(0);
  const lyricsRequestRef = useRef(0);
  const relatedRequestRef = useRef(0);
  const lyricsScrollRef = useRef<ScrollView>(null);
  const waveMotion = useRef(new Animated.Value(0)).current;
  const fullPlayerMotion = useRef(new Animated.Value(0)).current;
  const songMenuMotion = useRef(new Animated.Value(0)).current;
  const introScale = useRef(new Animated.Value(0.72)).current;
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introPulse = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const compactLayout = width < 420;

  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Finding music for you...");
  const [introVisible, setIntroVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profileInput, setProfileInput] = useState("");
  const [librarySongs, setLibrarySongs] = useState<Song[]>([]);
  const [libraryUsers, setLibraryUsers] = useState<string[]>([]);
  const [libraryMessage, setLibraryMessage] = useState("Your saved favorites will appear here.");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [playerPanel, setPlayerPanel] = useState<"lyrics" | "queue">("lyrics");
  const [lyrics, setLyrics] = useState("");
  const [syncedLyrics, setSyncedLyrics] = useState<LyricLine[]>([]);
  const [lyricsCredit, setLyricsCredit] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [myPlaylist, setMyPlaylist] = useState<Song[]>([]);
  const [privatePlaylists, setPrivatePlaylists] = useState<PrivatePlaylist[]>([]);
  const [playlistTargetSong, setPlaylistTargetSong] = useState<Song | null>(null);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [playlistNameInput, setPlaylistNameInput] = useState("");
  const [quality, setQuality] = useState<Quality>("high");
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepRemainingMs, setSleepRemainingMs] = useState(0);
  const [playerStateReady, setPlayerStateReady] = useState(false);
  const [, setQueueRevision] = useState(0);
  const [toast, setToast] = useState("");
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const favoriteIds = new Set(librarySongs.map((song) => song.id));

  const closeNowPlaying = useCallback(() => {
    nowPlayingRef.current = false;
    Animated.timing(fullPlayerMotion, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShowNowPlaying(false);
    });
  }, [fullPlayerMotion]);

  const closeSongMenu = useCallback(() => {
    songMenuRef.current = false;
    Animated.timing(songMenuMotion, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setActionSong(null);
    });
  }, [songMenuMotion]);

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged, Event.PlaybackError], (event) => {
    if (event.type === Event.PlaybackError) {
      console.warn("Playback failed", event);
      setMessage("This song could not play. Try another track.");
      return;
    }
    const songId = String(event.track?.id || "");
    const nextIndex = queueRef.current.findIndex((item) => item.id === songId);
    if (nextIndex < 0) return;
    const song = queueRef.current[nextIndex];
    indexRef.current = nextIndex;
    currentSongRef.current = song;
    setCurrentSong(song);
    setRecentSongs((items) => [song, ...items.filter((item) => item.id !== song.id)].slice(0, 30));
  });

  useEffect(() => {
    const nativeMode = repeatMode === "one" ? NativeRepeatMode.Track : repeatMode === "all" ? NativeRepeatMode.Queue : NativeRepeatMode.Off;
    void ensurePlayer().then(() => TrackPlayer.setRepeatMode(nativeMode)).catch(() => undefined);
  }, [repeatMode]);

  const activeLyricIndex = syncedLyrics.reduce((active, line, index) => line.time <= playback.currentTime + 0.15 ? index : active, -1);
  useEffect(() => {
    if (activeLyricIndex < 0 || !showNowPlaying || playerPanel !== "lyrics") return;
    lyricsScrollRef.current?.scrollTo({ y: Math.max(0, activeLyricIndex * 42 - 100), animated: true });
  }, [activeLyricIndex, playerPanel, showNowPlaying]);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  useEffect(() => { profileModalRef.current = showProfileSetup; }, [showProfileSetup]);
  useEffect(() => { profileMenuRef.current = showProfileMenu; }, [showProfileMenu]);
  useEffect(() => { shuffleRef.current = shuffleEnabled; }, [shuffleEnabled]);
  useEffect(() => { repeatRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { playbackPlayingRef.current = playback.playing; }, [playback.playing]);
  useEffect(() => { nowPlayingRef.current = showNowPlaying; }, [showNowPlaying]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    FileSystem.readAsStringAsync(PLAYER_STATE_FILE).then((text) => {
      const saved = JSON.parse(text);
      const savedRecentSongs: Song[] = Array.isArray(saved.recentSongs) ? saved.recentSongs : [];
      const savedCurrentSong: Song | null = saved.currentSong?.id ? saved.currentSong : savedRecentSongs[0] || null;
      setRecentSongs(savedRecentSongs);
      setSearchHistory(Array.isArray(saved.searchHistory) ? saved.searchHistory : []);
      setMyPlaylist(Array.isArray(saved.myPlaylist) ? saved.myPlaylist : []);
      setPrivatePlaylists(Array.isArray(saved.privatePlaylists) ? saved.privatePlaylists : []);
      if (["low", "standard", "high"].includes(saved.quality)) setQuality(saved.quality);
      if (savedCurrentSong) {
        const restoredQueue = [savedCurrentSong, ...savedRecentSongs.filter((song) => song.id !== savedCurrentSong.id)];
        queueRef.current = restoredQueue;
        indexRef.current = 0;
        currentSongRef.current = savedCurrentSong;
        setCurrentSong(savedCurrentSong);
        void TrackPlayer.reset()
          .then(() => TrackPlayer.add(restoredQueue.map((song) => toNativeTrack(song, saved.quality || "high"))))
          .catch((error) => console.warn("Could not restore last song", error));
      }
    }).catch(() => undefined).finally(() => setPlayerStateReady(true));
  }, []);

  useEffect(() => {
    if (!playerStateReady) return;
    FileSystem.writeAsStringAsync(PLAYER_STATE_FILE, JSON.stringify({ currentSong, recentSongs, searchHistory, myPlaylist, privatePlaylists, quality })).catch(() => undefined);
  }, [currentSong, myPlaylist, playerStateReady, privatePlaylists, quality, recentSongs, searchHistory]);

  useEffect(() => {
    if (!sleepEndsAt) return;
    const delay = sleepEndsAt - Date.now();
    if (delay <= 0) {
      void TrackPlayer.pause();
      setSleepEndsAt(null);
      return;
    }
    const timer = setTimeout(() => {
      void TrackPlayer.pause();
      resumeRequestedRef.current = false;
      setSleepEndsAt(null);
    }, delay);
    return () => clearTimeout(timer);
  }, [sleepEndsAt]);

  useEffect(() => {
    if (!sleepEndsAt) {
      setSleepRemainingMs(0);
      return;
    }
    const update = () => setSleepRemainingMs(Math.max(0, sleepEndsAt - Date.now()));
    update();
    const ticker = setInterval(update, 1000);
    return () => clearInterval(ticker);
  }, [sleepEndsAt]);

  useEffect(() => {
    if (!showNowPlaying || !currentSong) return;
    const requestId = ++lyricsRequestRef.current;
    setLyrics("");
    setSyncedLyrics([]);
    setLyricsCredit("");
    setLyricsLoading(true);
    const lyricsParams = new URLSearchParams({
      id: currentSong.id,
      title: currentSong.title,
      artist: currentSong.artist || "",
    });
    fetch(`${API_BASE}/api/music/lyrics?${lyricsParams}`)
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (requestId !== lyricsRequestRef.current) return;
        setLyrics(response.ok ? data.lyrics || "Lyrics are not available for this song." : "Lyrics are not available for this song.");
        setSyncedLyrics(response.ok ? parseSyncedLyrics(data.syncedLyrics || "") : []);
        setLyricsCredit(data.copyright || "");
      })
      .catch(() => {
        if (requestId === lyricsRequestRef.current) setLyrics("Lyrics could not be loaded right now.");
      })
      .finally(() => {
        if (requestId === lyricsRequestRef.current) setLyricsLoading(false);
      });
    return () => { lyricsRequestRef.current += 1; };
  }, [currentSong, showNowPlaying]);

  useEffect(() => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3 || activeTab !== "home") return;
    const requestId = ++searchRequestRef.current;
    const timer = setTimeout(async () => {
      try {
        const result = await fetchCatalog(cleanQuery, 12);
        if (requestId !== searchRequestRef.current) return;
        queueRef.current = result.songs;
        setSongs(result.songs);
        setPlaylists(result.playlists);
        setMessage(result.songs.length || result.playlists.length ? "Suggestions" : "Keep typing, or try a lyric line.");
      } catch {
        // Silent autocomplete failures should not interrupt playback or typing.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [activeTab, query]);

  const persistProfile = useCallback(async (name: string) => {
    const safeName = name.trim();
    if (!safeName) return;
    await FileSystem.writeAsStringAsync(PROFILE_FILE, JSON.stringify({ name: safeName }));
    setSelectedUser(safeName);
    setProfileInput(safeName);
  }, []);

  const refreshLibraryUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/library/users`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.ok === false) return;
      const names = (json.users || []).map((item: { name?: string }) => item.name).filter(Boolean);
      const current = selectedUserRef.current;
      setLibraryUsers(current && !names.includes(current) ? [current, ...names] : names);
    } catch {
      setLibraryUsers(selectedUserRef.current ? [selectedUserRef.current] : []);
    }
  }, []);

  const fetchLibraryForUser = useCallback(async (userName: string) => {
    const safeUser = userName.trim();
    if (!safeUser) return;
    try {
      const response = await fetch(`${API_BASE}/api/library?user=${encodeURIComponent(safeUser)}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.ok === false) {
        setLibrarySongs([]);
        setLibraryMessage("No favorites yet for this profile.");
        return;
      }

      const songs = Array.isArray(json.songs) ? json.songs : [];
      setLibrarySongs(songs);
      setLibraryMessage(songs.length ? `${safeUser}'s favorite songs` : "No favorites yet for this profile.");
      const playlistResponse = await fetch(`${API_BASE}/api/playlists/shared?user=${encodeURIComponent(safeUser)}`);
      const playlistJson = await playlistResponse.json().catch(() => ({}));
      setMyPlaylist(playlistResponse.ok && Array.isArray(playlistJson.songs) ? playlistJson.songs : []);
    } catch {
      setLibrarySongs([]);
      setMyPlaylist([]);
      setLibraryMessage("Favorites could not be loaded right now.");
    }
  }, []);

  const initProfile = useCallback(async () => {
    try {
      const text = await FileSystem.readAsStringAsync(PROFILE_FILE);
      const parsed = JSON.parse(text) as { name?: string };
      const saved = (parsed?.name || "").trim();
      if (saved) {
        setSelectedUser(saved);
        setProfileInput(saved);
        await refreshLibraryUsers();
        await fetchLibraryForUser(saved);
        return;
      }
    } catch {
      // ignore missing profile file
    }

    setSelectedUser(null);
    setProfileInput("");
    setShowProfileSetup(true);
    setLibrarySongs([]);
    setLibraryMessage("Create your profile to save favorites by name.");
  }, [fetchLibraryForUser, refreshLibraryUsers]);

  const saveSongToLibrary = useCallback(async (song: Song | null) => {
    if (!song) return;
    const safeUser = (selectedUser || profileInput || "").trim();
    if (!safeUser) {
      setShowProfileSetup(true);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/library/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: safeUser, song }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.ok === false) {
        Alert.alert("Oops", json.error || "Unable to save favorite.");
        return;
      }
      await refreshLibraryUsers();
      await fetchLibraryForUser(safeUser);
      setLibraryMessage(`${safeUser}'s favorite songs updated.`);
      setToast(`Added to ${safeUser}'s favorites`);
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Could not save favorite song.");
    }
  }, [fetchLibraryForUser, profileInput, refreshLibraryUsers, selectedUser]);

  useEffect(() => {
    void initProfile();
  }, [initProfile]);

  useEffect(() => {
    if (!selectedUser) return;
    void fetchLibraryForUser(selectedUser);
    void refreshLibraryUsers();
  }, [fetchLibraryForUser, refreshLibraryUsers, selectedUser]);

  useEffect(() => {
    void ensurePlayer().catch((error) => {
      console.warn("Track player setup failed", error);
      setMessage("Audio player could not start.");
    });

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (resumeRequestedRef.current && currentSongRef.current) {
          void TrackPlayer.play();
        }
        return;
      }

      if (playbackPlayingRef.current && (nextState === "background" || nextState === "inactive")) {
        resumeRequestedRef.current = true;
      }
    });

    loadRecommendations();
    const introAnimation = Animated.sequence([
      Animated.parallel([
        Animated.timing(introOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(introScale, { toValue: 1, damping: 10, stiffness: 145, mass: 0.8, useNativeDriver: true }),
        Animated.timing(introPulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(360),
      Animated.parallel([
        Animated.timing(introOpacity, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(introScale, { toValue: 1.08, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]);
    introAnimation.start(({ finished }) => {
      if (finished) setIntroVisible(false);
    });
    const waveAnimation = Animated.loop(Animated.sequence([
      Animated.timing(waveMotion, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(waveMotion, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    waveAnimation.start();
    return () => {
      introAnimation.stop();
      waveAnimation.stop();
      appStateSubscription.remove();
    };
  }, [introOpacity, introPulse, introScale, waveMotion]);

  useEffect(() => {
    const exitSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showCreatePlaylist) {
        setShowCreatePlaylist(false);
        setPlaylistTargetSong(null);
        return true;
      }
      if (showPlaylistPicker) {
        setShowPlaylistPicker(false);
        setPlaylistTargetSong(null);
        return true;
      }
      if (songMenuRef.current) {
        closeSongMenu();
        return true;
      }
      if (nowPlayingRef.current) {
        closeNowPlaying();
        return true;
      }
      if (profileMenuRef.current) {
        setShowProfileMenu(false);
        return true;
      }
      if (profileModalRef.current) {
        if (selectedUserRef.current) setShowProfileSetup(false);
        return true;
      }
      if (activeTabRef.current !== "home") {
        setActiveTab("home");
        return true;
      }
      return false;
    });
    return () => exitSubscription.remove();
  }, [closeNowPlaying, closeSongMenu, showCreatePlaylist, showPlaylistPicker]);

  const playSong = useCallback(async (song: Song, queue = queueRef.current) => {
    const index = queue.findIndex((item) => item.id === song.id);
    queueRef.current = queue;
    indexRef.current = index >= 0 ? index : 0;
    finishedSongRef.current = null;
    resumeRequestedRef.current = true;
    setCurrentSong(song);
    currentSongRef.current = song;
    setRecentSongs((items) => [song, ...items.filter((item) => item.id !== song.id)].slice(0, 30));
    setMessage("");
    await ensurePlayer();
    await TrackPlayer.reset();
    await TrackPlayer.add(queue.map((item) => toNativeTrack(item, quality)));
    if (index > 0) await TrackPlayer.skip(index);
    await TrackPlayer.play();
    const requestId = ++relatedRequestRef.current;
    fetchSongs(`/api/music/related?id=${encodeURIComponent(song.id)}&limit=18`).then((related) => {
      if (requestId !== relatedRequestRef.current || currentSongRef.current?.id !== song.id) return;
      const immediateNext = queue.slice(Math.max(0, index + 1), Math.max(0, index + 4));
      const seen = new Set([song.id]);
      const upNext = [...immediateNext, ...related].filter((item) => item.id && !seen.has(item.id) && seen.add(item.id));
      const existing = queueRef.current;
      const existingIds = new Set(existing.map((item) => item.id));
      const additions = upNext.filter((item) => !existingIds.has(item.id));
      queueRef.current = [...existing, ...additions];
      if (additions.length) void TrackPlayer.add(additions.map((item) => toNativeTrack(item, quality)));
      setQueueRevision((value) => value + 1);
    }).catch((error) => console.warn("Related songs failed", { songId: song.id, error }));
  }, [quality]);

  const playAt = useCallback((index: number) => {
    const queue = queueRef.current;
    if (!queue.length) return;
    const wrapped = (index + queue.length) % queue.length;
    playSong(queue[wrapped], queue);
  }, [playSong]);

  const changeTrack = useCallback(async (direction: -1 | 1) => {
    const queue = queueRef.current;
    if (!queue.length) return;
    if (direction > 0 && shuffleRef.current && queue.length > 1) {
      let nextIndex = indexRef.current;
      while (nextIndex === indexRef.current) nextIndex = Math.floor(Math.random() * queue.length);
      playAt(nextIndex);
      return;
    }
    try {
      if (direction > 0) await TrackPlayer.skipToNext();
      else await TrackPlayer.skipToPrevious();
      await TrackPlayer.play();
    } catch {
      if (repeatRef.current === "all") await playAt(direction > 0 ? 0 : queue.length - 1);
    }
  }, [playAt]);

  useEffect(() => {
    if (!playback.error) return;
    console.warn("Playback failed", { songId: currentSong?.id, error: playback.error });
    setMessage("This song could not play. Try another track.");
  }, [currentSong?.id, playback.error]);

  async function loadRecommendations(fresh = false) {
    setLoading(true);
    setMessage("Finding music for you...");
    setPlaylists([]);
    try {
      const refresh = fresh ? `&fresh=${Date.now()}` : "";
      const nextSongs = await fetchSongs(`/api/music/recommendations?mood=auto&language=auto&limit=18${refresh}`);
      queueRef.current = nextSongs;
      setSongs(nextSongs);
      setMessage(nextSongs.length ? "" : "No songs found right now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load music.");
    } finally {
      setLoading(false);
    }
  }

  async function search() {
    const cleanQuery = query.trim();
    if (!cleanQuery) return loadRecommendations();
    Keyboard.dismiss();
    setLoading(true);
    setMessage("Searching...");
    const requestId = ++searchRequestRef.current;
    setSearchHistory((items) => [cleanQuery, ...items.filter((item) => item.toLowerCase() !== cleanQuery.toLowerCase())].slice(0, 10));
    try {
      const result = await fetchCatalog(cleanQuery, 24);
      if (requestId !== searchRequestRef.current) return;
      const nextSongs = result.songs;
      const nextPlaylists = result.playlists;
      queueRef.current = nextSongs;
      setSongs(nextSongs);
      setPlaylists(nextPlaylists);
      setMessage(nextSongs.length || nextPlaylists.length ? "" : "Nothing found. Try a shorter song, artist, or playlist name.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function openPlaylist(playlist: Playlist) {
    setLoading(true);
    setMessage(`Opening ${playlist.title}...`);
    try {
      const nextSongs = await fetchSongs(`/api/music/playlist?id=${encodeURIComponent(playlist.id)}&limit=30`);
      queueRef.current = nextSongs;
      setSongs(nextSongs);
      setPlaylists([]);
      setMessage(nextSongs.length ? playlist.title : "This playlist is empty right now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Playlist could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  function togglePlayback() {
    if (!currentSong) {
      if (songs[0]) playSong(songs[0], songs);
      return;
    }
    if (playback.playing) {
      void TrackPlayer.pause();
      resumeRequestedRef.current = false;
      return;
    }

    resumeRequestedRef.current = true;
    void TrackPlayer.play();
  }

  function seek(locationX: number) {
    if (!playback.duration) return;
    const ratio = Math.max(0, Math.min(1, locationX / progressWidth.current));
    void TrackPlayer.seekTo(playback.duration * ratio);
  }

  const switchProfile = useCallback(async (name: string) => {
    const safeName = name.trim();
    if (!safeName) return;
    const response = await fetch(`${API_BASE}/api/library/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: safeName }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) {
      Alert.alert("Profile unavailable", json.error || "Could not open this profile.");
      return;
    }
    await persistProfile(safeName);
    await refreshLibraryUsers();
    await fetchLibraryForUser(safeName);
    setShowProfileSetup(false);
    setShowProfileMenu(false);
    setProfileInput(safeName);
    setMessage(`${safeName}'s favorites ready.`);
  }, [fetchLibraryForUser, persistProfile, refreshLibraryUsers]);

  const removeSongFromLibrary = useCallback(async (song: Song) => {
    if (!selectedUser) return;
    try {
      const response = await fetch(`${API_BASE}/api/library/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: selectedUser, songId: song.id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.ok === false) throw new Error(json.error || "Could not remove favorite.");
      setLibrarySongs(Array.isArray(json.songs) ? json.songs : []);
      setLibraryMessage(json.songs?.length ? `${selectedUser}'s favorite songs` : "No favorites yet for this profile.");
      setToast("Removed from favorites");
      await refreshLibraryUsers();
    } catch (error) {
      Alert.alert("Remove failed", error instanceof Error ? error.message : "Could not remove favorite.");
    }
  }, [refreshLibraryUsers, selectedUser]);

  async function toggleFavorite(song: Song | null) {
    if (!song) return;
    if (favoriteIds.has(song.id)) await removeSongFromLibrary(song);
    else await saveSongToLibrary(song);
  }

  function cycleRepeat() {
    setRepeatMode((current) => current === "off" ? "all" : current === "all" ? "one" : "off");
  }

  async function addNext(song: Song) {
    const queue = [...queueRef.current];
    const existing = queue.findIndex((item) => item.id === song.id);
    if (existing >= 0) {
      queue.splice(existing, 1);
      await TrackPlayer.remove(existing).catch(() => undefined);
    }
    const nextIndex = Math.max(0, indexRef.current + 1);
    queue.splice(nextIndex, 0, song);
    queueRef.current = queue;
    await ensurePlayer();
    await TrackPlayer.add(toNativeTrack(song, quality), nextIndex);
    setQueueRevision((value) => value + 1);
    setToast(`${song.title} will play next`);
  }

  function saveToPrivatePlaylist(song: Song, playlistId: string) {
    setPrivatePlaylists((items) => items.map((playlist) => playlist.id === playlistId
      ? { ...playlist, songs: [song, ...playlist.songs.filter((item) => item.id !== song.id)] }
      : playlist));
    setShowPlaylistPicker(false);
    setPlaylistTargetSong(null);
    const playlist = privatePlaylists.find((item) => item.id === playlistId);
    setToast(`Saved to ${playlist?.name || "private playlist"}`);
  }

  function createPrivatePlaylist() {
    const name = playlistNameInput.trim();
    if (!name) return;
    const playlist: PrivatePlaylist = { id: `private-${Date.now()}`, name: name.slice(0, 36), songs: playlistTargetSong ? [playlistTargetSong] : [] };
    setPrivatePlaylists((items) => [...items, playlist]);
    setPlaylistNameInput("");
    setShowCreatePlaylist(false);
    if (playlistTargetSong) setToast(`Saved to ${playlist.name}`);
    setPlaylistTargetSong(null);
  }

  async function addToMyPlaylist(song: Song) {
    const user = (selectedUser || profileInput || "").trim();
    if (!user) return setShowProfileSetup(true);
    try {
      const response = await fetch(`${API_BASE}/api/playlists/shared/add`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, song }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || "Could not update playlist.");
      setMyPlaylist(Array.isArray(data.songs) ? data.songs : []);
      setToast(`Added to ${user}'s playlist`);
    } catch (error) {
      Alert.alert("Playlist unavailable", error instanceof Error ? error.message : "Could not update playlist.");
    }
  }

  async function removeFromSharedPlaylist(song: Song) {
    if (!selectedUser) return;
    try {
      const response = await fetch(`${API_BASE}/api/playlists/shared/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: selectedUser, songId: song.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || "Could not remove song.");
      setMyPlaylist(Array.isArray(data.songs) ? data.songs : []);
    } catch (error) {
      Alert.alert("Remove failed", error instanceof Error ? error.message : "Could not remove song.");
    }
  }

  function showSongMenu(song: Song) {
    songMenuRef.current = true;
    songMenuMotion.setValue(0);
    setActionSong(song);
    requestAnimationFrame(() => {
      Animated.spring(songMenuMotion, {
        toValue: 1,
        damping: 22,
        stiffness: 260,
        mass: 0.82,
        useNativeDriver: true,
      }).start();
    });
  }

  function openNowPlaying() {
    nowPlayingRef.current = true;
    fullPlayerMotion.setValue(0);
    setShowNowPlaying(true);
    requestAnimationFrame(() => {
      Animated.spring(fullPlayerMotion, {
        toValue: 1,
        damping: 22,
        stiffness: 240,
        mass: 0.85,
        useNativeDriver: true,
      }).start();
    });
  }

  function chooseSleepTimer() {
    Alert.alert("Sleep timer", sleepEndsAt ? "A timer is active." : "Stop playback after", [
      ...[15, 30, 45, 60].map((minutes) => ({ text: `${minutes} minutes`, onPress: () => setSleepEndsAt(Date.now() + minutes * 60_000) })),
      ...(sleepEndsAt ? [{ text: "Cancel timer", onPress: () => setSleepEndsAt(null), style: "destructive" as const }] : []),
      { text: "Close", style: "cancel" }
    ]);
  }

  function cycleQuality() {
    setQuality((value) => value === "high" ? "standard" : value === "standard" ? "low" : "high");
  }

  const renderHomeList = () => (
    <>
      <View style={[styles.header, compactLayout && styles.headerCompact]}>
        <View style={styles.brandRow}>
          <Image source={require("./assets/saanjh-logo.png")} style={styles.brandLogo} />
          <View style={styles.headerBrand}>
            <Text style={styles.eyebrow}>MUSIC FOR EVERY MOOD</Text>
            <Text style={styles.title}>Saanjh</Text>
            <Text style={styles.credit}>Made by Ashu</Text>
          </View>
        </View>
        <Pressable style={[styles.mixButton, compactLayout && styles.mixButtonCompact]} onPress={() => loadRecommendations(true)}>
          <Text style={styles.mixButtonText}>NEW MIX</Text>
        </Pressable>
      </View>

      <View style={styles.pillRow}>
        <Pressable style={[styles.tabButton, activeTab === "home" && styles.tabButtonActive]} onPress={() => setActiveTab("home")}>
          <Text style={styles.tabText}>Home</Text>
        </Pressable>
        <Pressable style={[styles.tabButton, activeTab === "library" && styles.tabButtonActive]} onPress={() => setActiveTab("library")}>
          <Text style={styles.tabText}>Library</Text>
        </Pressable>
        <Pressable style={styles.userChip} onPress={() => setShowProfileMenu(true)}>
          <Text style={styles.userChipText}>{selectedUser || "Profile"}  ...</Text>
        </Pressable>
      </View>

      <View style={[styles.searchRow, compactLayout && styles.searchRowCompact]}>
        <TextInput style={[styles.searchInput, compactLayout && styles.searchInputCompact]} value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" placeholder="Song, artist, album or playlist" placeholderTextColor="#728087" />
        <Pressable style={[styles.searchButton, compactLayout && styles.searchButtonCompact]} onPress={search}><Text style={styles.searchButtonText}>SEARCH</Text></Pressable>
      </View>
      {query.length < 3 && searchHistory.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyRail}>{searchHistory.map((item) => <Pressable key={item} style={styles.historyChip} onPress={() => setQuery(item)}><Ionicons name="time-outline" size={13} color="#9eb0b6" /><Text style={styles.historyText}>{item}</Text></Pressable>)}</ScrollView> : null}
      {loading ? <ActivityIndicator color="#70ddef" style={styles.loader} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, compactLayout && styles.listCompact]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={playlists.length ? (
          <View style={styles.playlistSection}>
            <Text style={styles.sectionTitle}>Playlists</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playlistRail}>
              {playlists.map((playlist) => (
                <Pressable key={playlist.id} style={styles.playlistCard} onPress={() => openPlaylist(playlist)}>
                  {playlist.artwork ? <Image source={{ uri: playlist.artwork }} style={styles.playlistArt} /> : <View style={styles.playlistArt} />}
                  <Text style={styles.playlistTitle} numberOfLines={2}>{playlist.title}</Text>
                  <Text style={styles.playlistSubtitle} numberOfLines={1}>{playlist.subtitle || "Playlist"}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.sectionTitle}>Songs</Text>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <Pressable style={[styles.songRow, item.id === currentSong?.id && styles.songRowActive]} onPress={() => playSong(item, songs)} onLongPress={() => showSongMenu(item)}>
            {item.artwork ? <Image source={{ uri: item.artwork }} style={styles.thumb} /> : <View style={styles.thumbFallback}><Text style={styles.note}>♪</Text></View>}
            <View style={styles.songCopy}><Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.songArtist} numberOfLines={1}>{item.artist || item.album || "Unknown artist"}</Text></View>
            <Pressable style={styles.rowHeart} onPress={(event) => { event.stopPropagation(); void toggleFavorite(item); }}><Ionicons name={favoriteIds.has(item.id) ? "heart" : "heart-outline"} size={19} color={favoriteIds.has(item.id) ? "#58d68d" : "#718188"} /></Pressable>
            <Ionicons name={item.id === currentSong?.id && playback.playing ? "pause" : "play"} size={17} color="#70ddef" style={styles.rowAction} />
          </Pressable>
        )}
      />
    </>
  );

  const renderLibraryView = () => (
    <ScrollView style={styles.libraryWrap} contentContainerStyle={styles.libraryContent} showsVerticalScrollIndicator={false}>
      <View style={styles.libraryHeader}>
        <View>
          <Text style={styles.libraryTitle}>Shared library</Text>
          <Text style={styles.libraryMeta}>{selectedUser ? `${selectedUser}'s favorite songs` : "Choose a profile"}</Text>
        </View>
        <Pressable style={styles.menuButton} onPress={() => setShowProfileMenu(true)}><Text style={styles.menuButtonText}>...</Text></Pressable>
      </View>

      <ScrollView horizontal style={styles.profileScroller} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileList}>
        {libraryUsers.map((profile) => (
          <Pressable key={profile} style={[styles.profilePill, selectedUser === profile && styles.profilePillActive]} onPress={() => switchProfile(profile)}>
            <Text style={styles.profilePillText}>{profile}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {librarySongs.length ? <Text style={styles.libraryMessage}>{libraryMessage}</Text> : <View style={styles.emptyLibraryRow}><View style={styles.emptyLibraryIcon}><Ionicons name="heart-outline" size={20} color="#f3a675" /></View><View><Text style={styles.emptyLibraryTitle}>No favorites yet</Text><Text style={styles.emptyLibraryText}>Saved songs for this profile will appear here.</Text></View></View>}
      {recentSongs.length ? <View style={styles.libraryShelf}><Text style={styles.shelfTitle}>Recently played</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{recentSongs.slice(0, 10).map((song) => <Pressable key={song.id} style={styles.shelfCard} onPress={() => playSong(song, recentSongs)} onLongPress={() => showSongMenu(song)}>{song.artwork ? <Image source={{ uri: song.artwork }} style={styles.shelfArt} /> : <View style={styles.shelfArt} />}<Text style={styles.shelfSong} numberOfLines={1}>{song.title}</Text></Pressable>)}</ScrollView></View> : null}
      <View style={styles.libraryShelf}><Text style={styles.shelfTitle}>{selectedUser ? `${selectedUser}'s shared playlist` : "Shared playlist"}</Text>{myPlaylist.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{myPlaylist.slice(0, 20).map((song) => <Pressable key={song.id} style={styles.shelfCard} onPress={() => playSong(song, myPlaylist)} onLongPress={() => void removeFromSharedPlaylist(song)}>{song.artwork ? <Image source={{ uri: song.artwork }} style={styles.shelfArt} /> : <View style={styles.shelfArt} />}<Text style={styles.shelfSong} numberOfLines={1}>{song.title}</Text></Pressable>)}</ScrollView> : <View style={styles.emptyLibraryRow}><View style={styles.emptyLibraryIcon}><Ionicons name="musical-notes-outline" size={20} color="#70ddef" /></View><View><Text style={styles.emptyLibraryTitle}>Playlist is empty</Text><Text style={styles.emptyLibraryText}>Long-press any song and add it here.</Text></View></View>}</View>

      <View style={styles.privateHeader}><View><Text style={styles.shelfTitle}>Private playlists</Text><Text style={styles.privateHint}>Only on this phone</Text></View><Pressable style={styles.newPlaylistButton} onPress={() => { setPlaylistTargetSong(null); setPlaylistNameInput(""); setShowCreatePlaylist(true); }}><Ionicons name="add" size={18} color="#071014" /><Text style={styles.newPlaylistText}>New</Text></Pressable></View>
      {privatePlaylists.map((playlist) => (
        <View key={playlist.id} style={styles.privatePlaylistBlock}>
          <View style={styles.privatePlaylistTitleRow}><View style={styles.privateLock}><Ionicons name="lock-closed" size={13} color="#f3a675" /></View><Text style={styles.privatePlaylistTitle}>{playlist.name}</Text><Text style={styles.privatePlaylistCount}>{playlist.songs.length}</Text></View>
          {playlist.songs.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{playlist.songs.map((song) => <Pressable key={song.id} style={styles.shelfCard} onPress={() => playSong(song, playlist.songs)} onLongPress={() => setPrivatePlaylists((items) => items.map((item) => item.id === playlist.id ? { ...item, songs: item.songs.filter((entry) => entry.id !== song.id) } : item))}>{song.artwork ? <Image source={{ uri: song.artwork }} style={styles.shelfArt} /> : <View style={styles.shelfArt} />}<Text style={styles.shelfSong} numberOfLines={1}>{song.title}</Text></Pressable>)}</ScrollView> : <Text style={styles.privateEmpty}>No songs yet</Text>}
        </View>
      ))}
      {librarySongs.length ? <View style={styles.librarySongList}>
        {librarySongs.map((item) => (
          <Pressable key={`${selectedUser}-${item.id}`} style={[styles.songRow, item.id === currentSong?.id && styles.songRowActive]} onPress={() => playSong(item, librarySongs)} onLongPress={() => showSongMenu(item)}>
            {item.artwork ? <Image source={{ uri: item.artwork }} style={styles.thumb} /> : <View style={styles.thumbFallback}><Text style={styles.note}>♪</Text></View>}
            <View style={styles.songCopy}><Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.songArtist} numberOfLines={1}>{item.artist || item.album || "Unknown artist"}</Text></View>
            <Pressable style={styles.rowHeart} onPress={(event) => { event.stopPropagation(); void toggleFavorite(item); }}><Ionicons name="heart" size={19} color="#58d68d" /></Pressable>
            <Ionicons name={item.id === currentSong?.id && playback.playing ? "pause" : "play"} size={17} color="#70ddef" style={styles.rowAction} />
          </Pressable>
        ))}
      </View> : null}
    </ScrollView>
  );

  return (
    <SafeAreaProvider>
    <View style={styles.appRoot}>
    <StatusBar barStyle="light-content" backgroundColor="#030303" translucent={false} />
    <ImageBackground source={require("./assets/saanjh-sunset.png")} style={styles.background} resizeMode="cover">
      <View style={styles.backdrop} />
      <Animated.View style={[styles.nativeWave, styles.nativeWaveFar, { transform: [{ translateX: waveMotion.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] }) }] }]} />
      <Animated.View style={[styles.nativeWave, styles.nativeWaveNear, { transform: [{ translateX: waveMotion.interpolate({ inputRange: [0, 1], outputRange: [20, -16] }) }] }]} />
      <SafeAreaView style={styles.safeArea} edges={["top", "right", "bottom", "left"]}>

        {activeTab === "home" ? renderHomeList() : renderLibraryView()}

        <View style={[styles.player, compactLayout && styles.playerCompact]}>
          <Pressable style={styles.nowPlaying} onPress={openNowPlaying}>
            {currentSong?.artwork ? <Image source={{ uri: currentSong.artwork }} style={styles.playerArtwork} /> : <View style={styles.playerArtwork} />}
            <View style={styles.playerCopy}><Text style={styles.playerTitle} numberOfLines={1}>{currentSong?.title || "Choose a song"}</Text><Text style={styles.playerArtist} numberOfLines={1}>{currentSong?.artist || "Ready when you are"}</Text></View>
            <Pressable style={[styles.saveButton, currentSong && favoriteIds.has(currentSong.id) && styles.saveButtonActive]} onPress={(event) => { event.stopPropagation(); void toggleFavorite(currentSong); }}>
              <Ionicons name={currentSong && favoriteIds.has(currentSong.id) ? "heart" : "heart-outline"} size={19} color={currentSong && favoriteIds.has(currentSong.id) ? "#58d68d" : "#ffd5ba"} />
            </Pressable>
            {playback.isBuffering ? <ActivityIndicator color="#70ddef" /> : null}
          </Pressable>
          <Pressable style={styles.progressHit} onLayout={(event) => { progressWidth.current = event.nativeEvent.layout.width; }} onPress={(event) => seek(event.nativeEvent.locationX)}>
            <View style={styles.progressTrack}><View style={[styles.progressLive, { width: `${playback.duration ? Math.min(100, (playback.currentTime / playback.duration) * 100) : 0}%` }]} /></View>
          </Pressable>
          <View style={styles.times}><Text style={styles.time}>{formatTime(playback.currentTime)}</Text><Text style={styles.time}>{formatTime(playback.duration)}</Text></View>
          <View style={styles.controls}>
            <Pressable accessibilityLabel="Shuffle" style={[styles.modeButton, shuffleEnabled && styles.modeButtonActive]} onPress={() => setShuffleEnabled((value) => !value)}>
              <Ionicons name="shuffle" size={21} color={shuffleEnabled ? "#70ddef" : "#87969c"} />
            </Pressable>
            <Pressable accessibilityLabel="Previous song" style={[styles.controlButton, compactLayout && styles.controlButtonCompact]} onPress={() => changeTrack(-1)}>
              <Ionicons name="play-skip-back" size={20} color="#e8f0f2" />
            </Pressable>
            <Pressable accessibilityLabel={playback.playing ? "Pause" : "Play"} style={[styles.playButton, compactLayout && styles.playButtonCompact]} onPress={togglePlayback}>
              <Ionicons name={playback.playing ? "pause" : "play"} size={27} color="#1c0d08" style={!playback.playing ? styles.playIconOffset : undefined} />
            </Pressable>
            <Pressable accessibilityLabel="Next song" style={[styles.controlButton, compactLayout && styles.controlButtonCompact]} onPress={() => changeTrack(1)}>
              <Ionicons name="play-skip-forward" size={20} color="#e8f0f2" />
            </Pressable>
            <Pressable accessibilityLabel="Repeat" style={[styles.modeButton, repeatMode !== "off" && styles.modeButtonActive]} onPress={cycleRepeat}>
              <Ionicons name={repeatMode === "one" ? "repeat" : "repeat-outline"} size={21} color={repeatMode !== "off" ? "#70ddef" : "#87969c"} />
              {repeatMode === "one" ? <Text style={styles.repeatOne}>1</Text> : null}
            </Pressable>
          </View>
        </View>

        {showProfileMenu ? (
          <Pressable style={styles.menuOverlay} onPress={() => setShowProfileMenu(false)}>
            <Pressable style={styles.profileMenuCard} onPress={(event) => event.stopPropagation()}>
              <View style={styles.profileMenuHeader}>
                <View><Text style={styles.profileMenuTitle}>Friends</Text><Text style={styles.profileMenuSubtitle}>Switch and listen together</Text></View>
                <Pressable style={styles.closeButton} onPress={() => setShowProfileMenu(false)}><Text style={styles.closeButtonText}>X</Text></Pressable>
              </View>
              {libraryUsers.map((name) => (
                <Pressable key={name} style={[styles.profileMenuItem, selectedUser === name && styles.profileMenuItemActive]} onPress={() => { void switchProfile(name); setActiveTab("library"); }}>
                  <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
                  <Text style={styles.profileMenuName}>{name}'s favorite songs</Text>
                  <Text style={styles.profileMenuArrow}>&gt;</Text>
                </Pressable>
              ))}
              <Pressable style={styles.addProfileButton} onPress={() => { setShowProfileMenu(false); setProfileInput(""); setShowProfileSetup(true); }}><Text style={styles.addProfileText}>+ Add your name</Text></Pressable>
            </Pressable>
          </Pressable>
        ) : null}

        {showProfileSetup ? (
          <View style={styles.profileModal}>
            <View style={styles.profileCard}>
              <Text style={styles.profileCardTitle}>Who are you?</Text>
              <Text style={styles.profileCardSubtitle}>Your favorites stay under your name and are visible to the group.</Text>
              {libraryUsers.length ? <Text style={styles.existingLabel}>Or choose an existing friend</Text> : null}
              <View style={styles.profilePresetRow}>
                {libraryUsers.map((name) => (
                  <Pressable key={name} style={[styles.presetButton, profileInput === name && styles.presetButtonActive]} onPress={() => setProfileInput(name)}>
                    <Text style={styles.presetButtonText}>{name}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={profileInput}
                onChangeText={setProfileInput}
                placeholder="Enter your name"
                placeholderTextColor="#7d8c92"
                style={styles.profileInput}
              />
              <View style={styles.profileActions}>
                {selectedUser ? <Pressable style={styles.cancelButton} onPress={() => setShowProfileSetup(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable> : null}
                <Pressable style={[styles.saveProfileButton, !selectedUser && styles.saveProfileButtonFull]} onPress={() => switchProfile(profileInput)}>
                  <Text style={styles.saveProfileButtonText}>Continue</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
        {showPlaylistPicker && playlistTargetSong ? (
          <View style={styles.playlistModalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowPlaylistPicker(false); setPlaylistTargetSong(null); }} />
            <View style={styles.playlistPickerCard}>
              <View style={styles.playlistPickerHeader}><View><Text style={styles.playlistPickerTitle}>Save privately</Text><Text style={styles.playlistPickerSubtitle} numberOfLines={1}>{playlistTargetSong.title}</Text></View><Pressable style={styles.sheetClose} onPress={() => { setShowPlaylistPicker(false); setPlaylistTargetSong(null); }}><Ionicons name="close" size={21} color="#aab7bc" /></Pressable></View>
              {privatePlaylists.map((playlist) => <Pressable key={playlist.id} style={styles.playlistChoice} onPress={() => saveToPrivatePlaylist(playlistTargetSong, playlist.id)}><View style={styles.sheetActionIcon}><Ionicons name="lock-closed-outline" size={18} color="#f3a675" /></View><View style={styles.songCopy}><Text style={styles.playlistChoiceName}>{playlist.name}</Text><Text style={styles.playlistChoiceCount}>{playlist.songs.length} songs</Text></View><Ionicons name="add-circle-outline" size={21} color="#70ddef" /></Pressable>)}
              <Pressable style={styles.createPlaylistChoice} onPress={() => { setShowPlaylistPicker(false); setPlaylistNameInput(""); setShowCreatePlaylist(true); }}><Ionicons name="add" size={20} color="#071014" /><Text style={styles.createPlaylistChoiceText}>Create new playlist</Text></Pressable>
            </View>
          </View>
        ) : null}
        {showCreatePlaylist ? (
          <View style={styles.playlistModalOverlay}>
            <View style={styles.createPlaylistCard}><Text style={styles.playlistPickerTitle}>New private playlist</Text><TextInput value={playlistNameInput} onChangeText={setPlaylistNameInput} autoFocus maxLength={36} placeholder="Playlist name" placeholderTextColor="#718087" style={styles.profileInput} /><View style={styles.profileActions}><Pressable style={styles.cancelButton} onPress={() => { setShowCreatePlaylist(false); setPlaylistTargetSong(null); }}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable style={styles.saveProfileButton} onPress={createPrivatePlaylist}><Text style={styles.saveProfileButtonText}>Create</Text></Pressable></View></View>
          </View>
        ) : null}
        {actionSong ? (
          <Animated.View style={[styles.songMenuOverlay, { opacity: songMenuMotion }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSongMenu} />
            <Animated.View style={[styles.songMenuSheet, {
              transform: [{ translateY: songMenuMotion.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }],
            }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetSongHeader}>
                {actionSong.artwork ? <Image source={{ uri: actionSong.artwork }} style={styles.sheetArtwork} /> : <View style={styles.sheetArtwork} />}
                <View style={styles.songCopy}><Text style={styles.sheetTitle} numberOfLines={1}>{actionSong.title}</Text><Text style={styles.sheetArtist} numberOfLines={1}>{actionSong.artist || "Unknown artist"}</Text></View>
                <Pressable style={styles.sheetClose} onPress={closeSongMenu}><Ionicons name="close" size={21} color="#aab7bc" /></Pressable>
              </View>
              <View style={styles.sheetDivider} />
              <Pressable style={styles.sheetAction} onPress={() => { const song = actionSong; closeSongMenu(); void toggleFavorite(song); }}><View style={styles.sheetActionIcon}><Ionicons name={favoriteIds.has(actionSong.id) ? "heart" : "heart-outline"} size={21} color={favoriteIds.has(actionSong.id) ? "#58d68d" : "#f3a675"} /></View><Text style={styles.sheetActionText}>{favoriteIds.has(actionSong.id) ? "Remove from favorites" : "Save to favorites"}</Text><Ionicons name="chevron-forward" size={18} color="#526168" /></Pressable>
              <Pressable style={styles.sheetAction} onPress={() => { const song = actionSong; closeSongMenu(); void addToMyPlaylist(song); }}><View style={styles.sheetActionIcon}><Ionicons name="people-outline" size={21} color="#70ddef" /></View><Text style={styles.sheetActionText}>Save to shared playlist</Text><Ionicons name="chevron-forward" size={18} color="#526168" /></Pressable>
              <Pressable style={styles.sheetAction} onPress={() => { const song = actionSong; closeSongMenu(); setPlaylistTargetSong(song); setShowPlaylistPicker(true); }}><View style={styles.sheetActionIcon}><Ionicons name="lock-closed-outline" size={20} color="#f3a675" /></View><Text style={styles.sheetActionText}>Save to private playlist</Text><Ionicons name="chevron-forward" size={18} color="#526168" /></Pressable>
              <Pressable style={styles.sheetAction} onPress={() => { const song = actionSong; closeSongMenu(); addNext(song); }}><View style={styles.sheetActionIcon}><Ionicons name="play-skip-forward-outline" size={21} color="#d6e4e8" /></View><Text style={styles.sheetActionText}>Play next</Text><Ionicons name="chevron-forward" size={18} color="#526168" /></Pressable>
              <Pressable style={styles.sheetAction} onPress={() => { const artist = (actionSong.artist || "").split(",")[0]; closeSongMenu(); setQuery(artist); setActiveTab("home"); }}><View style={styles.sheetActionIcon}><Ionicons name="search" size={20} color="#d6e4e8" /></View><Text style={styles.sheetActionText}>More from this artist</Text><Ionicons name="chevron-forward" size={18} color="#526168" /></Pressable>
            </Animated.View>
          </Animated.View>
        ) : null}
        {showNowPlaying ? (
          <Animated.View style={[styles.fullPlayer, {
            opacity: fullPlayerMotion,
            transform: [{ translateY: fullPlayerMotion.interpolate({ inputRange: [0, 1], outputRange: [42, 0] }) }],
          }]}>
            <View style={styles.fullPlayerHeader}>
              <Pressable style={styles.fullIconButton} onPress={closeNowPlaying}><Ionicons name="chevron-down" size={25} color="#edf5f7" /></Pressable>
              <View style={styles.fullHeaderCopy}><Text style={styles.fullKicker}>NOW PLAYING</Text><Text style={styles.fullAlbum} numberOfLines={1}>{currentSong?.album || "Saanjh mix"}</Text></View>
              <Pressable style={styles.fullIconButton} onPress={() => currentSong && showSongMenu(currentSong)}><Ionicons name="ellipsis-horizontal" size={23} color="#edf5f7" /></Pressable>
            </View>
            <View onTouchStart={(event) => { swipeStartRef.current = event.nativeEvent.pageX; }} onTouchEnd={(event) => { const distance = event.nativeEvent.pageX - swipeStartRef.current; if (Math.abs(distance) > 55) changeTrack(distance < 0 ? 1 : -1); }}>
              {currentSong?.artwork ? <Image source={{ uri: currentSong.artwork }} style={styles.fullArtwork} /> : <View style={styles.fullArtwork} />}
            </View>
            <View style={styles.fullSongRow}><View style={styles.fullSongCopy}><Text style={styles.fullTitle} numberOfLines={1}>{currentSong?.title || "Choose a song"}</Text><Text style={styles.fullArtist} numberOfLines={1}>{currentSong?.artist || "Ready when you are"}</Text></View><Pressable style={styles.fullIconButton} onPress={() => void toggleFavorite(currentSong)}><Ionicons name={currentSong && favoriteIds.has(currentSong.id) ? "heart" : "heart-outline"} size={26} color={currentSong && favoriteIds.has(currentSong.id) ? "#58d68d" : "#ffc6a2"} /></Pressable></View>
            <Pressable style={styles.fullProgressHit} onLayout={(event) => { progressWidth.current = event.nativeEvent.layout.width; }} onPress={(event) => seek(event.nativeEvent.locationX)}><View style={styles.fullProgress}><View style={[styles.progressLive, { width: `${playback.duration ? Math.min(100, playback.currentTime / playback.duration * 100) : 0}%` }]} /></View></Pressable>
            <View style={styles.times}><Text style={styles.time}>{formatTime(playback.currentTime)}</Text><Text style={styles.time}>-{formatTime(Math.max(0, playback.duration - playback.currentTime))}</Text></View>
            <View style={styles.fullControls}>
              <Pressable onPress={() => setShuffleEnabled((value) => !value)}><Ionicons name="shuffle" size={23} color={shuffleEnabled ? "#70ddef" : "#91a0a6"} /></Pressable><Pressable onPress={() => changeTrack(-1)}><Ionicons name="play-skip-back" size={29} color="#f5f8f9" /></Pressable><Pressable style={styles.fullPlay} onPress={togglePlayback}><Ionicons name={playback.playing ? "pause" : "play"} size={35} color="#20100a" /></Pressable><Pressable onPress={() => changeTrack(1)}><Ionicons name="play-skip-forward" size={29} color="#f5f8f9" /></Pressable><Pressable onPress={cycleRepeat}><Ionicons name={repeatMode === "one" ? "repeat" : "repeat-outline"} size={23} color={repeatMode !== "off" ? "#70ddef" : "#91a0a6"} /></Pressable>
            </View>
            <View style={styles.toolRow}><Pressable style={styles.toolButton} onPress={chooseSleepTimer}><Ionicons name="moon-outline" size={19} color={sleepEndsAt ? "#70ddef" : "#b8c5c9"} /><Text style={styles.toolText}>{sleepEndsAt ? formatRemaining(sleepRemainingMs) : "Sleep"}</Text></Pressable><Pressable style={styles.toolButton} onPress={cycleQuality}><Ionicons name="options-outline" size={19} color="#b8c5c9" /><Text style={styles.toolText}>{quality}</Text></Pressable><Pressable style={styles.toolButton} onPress={() => setPlayerPanel("queue")}><Ionicons name="list" size={20} color="#b8c5c9" /><Text style={styles.toolText}>Queue</Text></Pressable></View>
            <View style={styles.panelTabs}><Pressable style={[styles.panelTab, playerPanel === "lyrics" && styles.panelTabActive]} onPress={() => setPlayerPanel("lyrics")}><Text style={styles.panelTabText}>Lyrics</Text></Pressable><Pressable style={[styles.panelTab, playerPanel === "queue" && styles.panelTabActive]} onPress={() => setPlayerPanel("queue")}><Text style={styles.panelTabText}>Up next</Text></Pressable></View>
            {playerPanel === "lyrics" ? <ScrollView ref={lyricsScrollRef} style={styles.panelBody} contentContainerStyle={styles.lyricsBody}>{lyricsLoading ? <ActivityIndicator color="#70ddef" /> : syncedLyrics.length ? syncedLyrics.map((line, index) => <Pressable key={`${line.time}-${index}`} onPress={() => void TrackPlayer.seekTo(line.time)}><Text style={[styles.syncedLyricLine, index === activeLyricIndex && styles.syncedLyricActive, index < activeLyricIndex && styles.syncedLyricPast]}>{line.text}</Text></Pressable>) : <Text style={styles.lyricsText}>{lyrics || "Lyrics are not available for this song."}</Text>}{lyricsCredit ? <Text style={styles.lyricsCredit}>{lyricsCredit}</Text> : null}</ScrollView> : <ScrollView style={styles.panelBody}>{queueRef.current.map((song, index) => <Pressable key={`${song.id}-${index}`} style={[styles.queueRow, index === indexRef.current && styles.queueRowActive]} onPress={() => playAt(index)}><Text style={styles.queueIndex}>{index === indexRef.current ? "•" : index + 1}</Text><View style={styles.songCopy}><Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text><Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text></View><Pressable onPress={(event) => { event.stopPropagation(); const queue = [...queueRef.current]; queue.splice(index, 1); queueRef.current = queue; void TrackPlayer.remove(index); setQueueRevision((value) => value + 1); }}><Ionicons name="close" size={19} color="#839197" /></Pressable></Pressable>)}</ScrollView>}
          </Animated.View>
        ) : null}
        {toast ? <View style={styles.toast}><Ionicons name="checkmark-circle" size={20} color="#58d68d" /><Text style={styles.toastText}>{toast}</Text></View> : null}
      </SafeAreaView>
    </ImageBackground>
    {introVisible ? <View style={styles.intro}>
      <Animated.View style={[styles.introContent, { opacity: introOpacity }]}>
        <Animated.View style={[styles.introPulse, { opacity: introPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: introPulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.55] }) }] }]} />
        <Animated.Image source={require("./assets/saanjh-logo.png")} style={[styles.introLogo, { transform: [{ scale: introScale }] }]} />
        <Animated.Text style={[styles.introName, { transform: [{ translateY: introOpacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>SAANJH</Animated.Text>
        <Text style={styles.introTagline}>Music for every mood</Text>
      </Animated.View>
    </View> : null}
    </View>
    </SafeAreaProvider>
  );
}

async function fetchSongs(path: string): Promise<Song[]> {
  const response = await fetch(`${API_BASE}${path}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) throw new Error(json.error || `Music service returned ${response.status}`);
  return json.songs || [];
}

async function fetchCatalog(query: string, limit: number): Promise<{ songs: Song[]; playlists: Playlist[] }> {
  const response = await fetch(`${API_BASE}/api/music/search?query=${encodeURIComponent(query)}&language=auto&limit=${limit}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) throw new Error(json.error || `Music service returned ${response.status}`);
  return {
    songs: Array.isArray(json.songs) ? json.songs : [],
    playlists: Array.isArray(json.playlists) ? json.playlists : []
  };
}

function streamUrl(id: string, quality: Quality) { return `${API_BASE}/api/music/stream?id=${encodeURIComponent(id)}&quality=${quality}`; }
function toNativeTrack(song: Song, quality: Quality) {
  return {
    id: song.id,
    url: streamUrl(song.id, quality),
    title: song.title,
    artist: song.artist || "Saanjh Music",
    album: song.album || "Saanjh mix",
    artwork: song.artwork,
  };
}
function parseSyncedLyrics(value: string): LyricLine[] {
  return String(value || "").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (!match || !match[4]?.trim()) return [];
    const fraction = Number(`0.${match[3] || "0"}`);
    return [{ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text: match[4].trim() }];
  }).sort((a, b) => a.time - b.time);
}
function formatTime(value = 0) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}
function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  startupGate: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, backgroundColor: "#030303" },
  startupLogo: { width: 92, height: 92, borderRadius: 20 },
  startupError: { color: "#d8e1e4", fontSize: 14 },
  startupRetry: { minWidth: 104, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: "#f3a675" },
  startupRetryText: { color: "#071014", fontSize: 12, fontWeight: "900" },
  appRoot: { flex: 1, backgroundColor: "#030303" },
  background: { flex: 1, backgroundColor: "#071014" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(4, 10, 13, 0.68)" },
  safeArea: { flex: 1 },
  nativeWave: { position: "absolute", left: -40, right: -40, height: 80, borderTopWidth: 2, borderColor: "rgba(231, 249, 246, 0.34)", borderRadius: 200 },
  nativeWaveFar: { bottom: 250, opacity: 0.5 },
  nativeWaveNear: { bottom: 175, height: 110, opacity: 0.68 },
  intro: { ...StyleSheet.absoluteFill, zIndex: 60, alignItems: "center", justifyContent: "center", backgroundColor: "#030303" },
  introContent: { alignItems: "center", justifyContent: "center" },
  introPulse: { position: "absolute", width: 126, height: 126, borderRadius: 63, borderWidth: 1, borderColor: "rgba(112,221,239,0.72)", backgroundColor: "rgba(243,166,117,0.09)" },
  introLogo: { width: 92, height: 92, borderRadius: 20 },
  introName: { color: "#fff7f0", fontSize: 22, fontWeight: "900", letterSpacing: 4, marginTop: 18 },
  introTagline: { color: "rgba(255,213,186,0.7)", fontSize: 10, letterSpacing: 1.4, marginTop: 6, textTransform: "uppercase" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerCompact: { paddingHorizontal: 16, paddingTop: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  brandLogo: { width: 42, height: 42, borderRadius: 8 },
  headerBrand: { flexShrink: 1 },
  eyebrow: { color: "#ffc49f", fontSize: 9, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: "#fff9f2", fontFamily: "serif", fontSize: 34, marginTop: 1 },
  credit: { color: "rgba(255, 231, 211, 0.7)", fontSize: 10, marginTop: -2 },
  pillRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 8, marginBottom: 10 },
  tabButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(10,17,20,0.5)" },
  tabButtonActive: { backgroundColor: "rgba(255,147,92,0.26)", borderColor: "rgba(255,147,92,0.8)" },
  tabText: { color: "#fdf4ed", fontSize: 12, fontWeight: "800" },
  userChip: { marginLeft: "auto", borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(8,15,18,0.58)", paddingHorizontal: 12, paddingVertical: 8 },
  userChipText: { color: "#dfe9ee", fontSize: 11, fontWeight: "700" },
  mixButton: { borderWidth: 1, borderColor: "#314047", borderRadius: 6, paddingHorizontal: 13, paddingVertical: 9 },
  mixButtonCompact: { paddingHorizontal: 10, paddingVertical: 8 },
  mixButtonText: { color: "#c9d5d9", fontSize: 11, fontWeight: "800" },
  searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  searchRowCompact: { paddingHorizontal: 16, gap: 6 },
  searchInput: { flex: 1, height: 46, borderWidth: 1, borderColor: "#27343a", borderRadius: 7, backgroundColor: "#0d1317", color: "#f5f8fa", paddingHorizontal: 13 },
  searchInputCompact: { minHeight: 42 },
  searchButton: { height: 46, justifyContent: "center", paddingHorizontal: 14, borderRadius: 7, backgroundColor: "#774431" },
  searchButtonCompact: { paddingHorizontal: 10 },
  searchButtonText: { color: "#dffaff", fontSize: 11, fontWeight: "900" },
  historyRail: { paddingHorizontal: 16, paddingBottom: 8, gap: 7 },
  historyChip: { height: 31, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: 16, backgroundColor: "rgba(8,16,19,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  historyText: { color: "#c7d2d6", fontSize: 11 },
  loader: { marginVertical: 8 },
  message: { color: "#9ba9af", fontSize: 13, paddingHorizontal: 20, paddingVertical: 8 },
  list: { paddingHorizontal: 14, paddingBottom: 205 },
  listCompact: { paddingBottom: 220 },
  playlistSection: { paddingTop: 4, paddingBottom: 8 },
  sectionTitle: { color: "#f4ede8", fontSize: 15, fontWeight: "900", marginHorizontal: 6, marginBottom: 9 },
  playlistRail: { gap: 10, paddingHorizontal: 4, paddingBottom: 14 },
  playlistCard: { width: 126 },
  playlistArt: { width: 126, height: 126, borderRadius: 7, backgroundColor: "#11191d", marginBottom: 7 },
  playlistTitle: { color: "#eef4f6", fontSize: 12, lineHeight: 16, fontWeight: "800", minHeight: 32 },
  playlistSubtitle: { color: "#829197", fontSize: 10, marginTop: 3 },
  songRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 7, borderWidth: 1, borderColor: "transparent", borderRadius: 7 },
  songRowActive: { backgroundColor: "rgba(112, 58, 39, 0.72)", borderColor: "#a66a4f" },
  thumb: { width: 50, height: 50, borderRadius: 5, backgroundColor: "#11191d" },
  thumbFallback: { width: 50, height: 50, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: "#11191d" },
  note: { color: "#70ddef", fontSize: 19 },
  songCopy: { flex: 1, minWidth: 0 },
  songTitle: { color: "#edf3f5", fontSize: 14, fontWeight: "700" },
  songArtist: { color: "#87969c", fontSize: 12, marginTop: 4 },
  rowAction: { width: 30, color: "#70ddef", fontSize: 13, textAlign: "center" },
  rowHeart: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  removeButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.05)" },
  removeButtonText: { color: "#a9b7bc", fontSize: 10, fontWeight: "900" },
  player: { position: "absolute", left: 10, right: 10, bottom: 8, padding: 14, borderWidth: 1, borderColor: "rgba(255, 221, 198, 0.28)", borderRadius: 8, backgroundColor: "#081014", shadowColor: "#000", shadowOpacity: 0.42, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 16 },
  playerCompact: { left: 8, right: 8, bottom: 6, padding: 11 },
  nowPlaying: { flexDirection: "row", alignItems: "center", gap: 11 },
  playerArtwork: { width: 54, height: 54, borderRadius: 7, backgroundColor: "#121b1f" },
  playerCopy: { flex: 1, minWidth: 0 },
  playerTitle: { color: "#f5f8fa", fontSize: 15, fontWeight: "800" },
  playerArtist: { color: "#8f9ea4", fontSize: 12, marginTop: 3 },
  saveButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,172,124,0.15)", borderWidth: 1, borderColor: "rgba(255,172,124,0.55)", alignItems: "center", justifyContent: "center" },
  saveButtonActive: { backgroundColor: "rgba(88,214,141,0.12)", borderColor: "rgba(88,214,141,0.55)" },
  progressHit: { paddingVertical: 10 },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: "#273238", overflow: "hidden" },
  progressLive: { height: "100%", backgroundColor: "#f3a675" },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: -5 },
  time: { color: "#77868c", fontSize: 10, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", gap: 7, marginTop: 4 },
  controlButton: { width: 44, height: 44, borderWidth: 1, borderColor: "#2b393f", borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#0c171b" },
  controlButtonCompact: { width: 38 },
  modeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, position: "relative" },
  modeButtonActive: { backgroundColor: "rgba(112,221,239,0.13)" },
  repeatOne: { position: "absolute", right: 5, bottom: 4, color: "#70ddef", fontSize: 8, fontWeight: "900" },
  playButton: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#f3a675" },
  playButtonCompact: { width: 48, height: 48, borderRadius: 24 },
  playIconOffset: { marginLeft: 3 },
  libraryWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8, backgroundColor: "rgba(3, 9, 12, 0.42)" },
  libraryContent: { paddingBottom: 210 },
  librarySongList: { paddingTop: 2 },
  libraryHeader: { paddingHorizontal: 6, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  libraryTitle: { color: "#f7f3ee", fontSize: 28, fontWeight: "900" },
  libraryMeta: { color: "#d1dfe4", fontSize: 12, marginTop: 4 },
  libraryMessage: { color: "#c9dbe0", fontSize: 12, marginBottom: 8, paddingHorizontal: 4 },
  emptyLibraryRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, marginBottom: 12 },
  emptyLibraryIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,18,21,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  emptyLibraryTitle: { color: "#edf3f5", fontSize: 13, fontWeight: "800" },
  emptyLibraryText: { color: "#8d9ba1", fontSize: 11, marginTop: 3 },
  libraryShelf: { marginBottom: 12 },
  shelfTitle: { color: "#f3f7f8", fontSize: 14, fontWeight: "900", marginBottom: 8, paddingHorizontal: 4 },
  shelfCard: { width: 92, marginRight: 10 },
  shelfArt: { width: 92, height: 92, borderRadius: 7, backgroundColor: "#111b1f" },
  shelfSong: { color: "#dfe8eb", fontSize: 11, fontWeight: "700", marginTop: 5 },
  privateHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9, paddingHorizontal: 4 },
  privateHint: { color: "#75868c", fontSize: 10, marginTop: -4 },
  newPlaylistButton: { height: 34, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 11, borderRadius: 17, backgroundColor: "#f3a675" },
  newPlaylistText: { color: "#071014", fontSize: 11, fontWeight: "900" },
  privatePlaylistBlock: { marginBottom: 14, padding: 10, borderRadius: 8, backgroundColor: "rgba(7,16,19,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  privatePlaylistTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  privateLock: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(243,166,117,0.12)" },
  privatePlaylistTitle: { flex: 1, color: "#eef4f6", fontSize: 13, fontWeight: "900", marginLeft: 8 },
  privatePlaylistCount: { color: "#718087", fontSize: 11 },
  privateEmpty: { color: "#718087", fontSize: 11, paddingVertical: 8 },
  profileScroller: { flexGrow: 0, maxHeight: 54, marginBottom: 4 },
  profileList: { height: 50, alignItems: "center", paddingHorizontal: 4 },
  profilePill: { height: 38, justifyContent: "center", paddingHorizontal: 15, marginRight: 8, borderRadius: 19, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(7,13,15,0.82)" },
  profilePillActive: { backgroundColor: "rgba(255,146,91,0.26)", borderColor: "rgba(255,146,91,0.8)" },
  profilePillText: { color: "#f5f8fa", fontSize: 11, fontWeight: "700" },
  menuButton: { width: 38, height: 38, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,13,15,0.62)" },
  menuButtonText: { color: "#f6eee8", fontSize: 18, fontWeight: "900", marginTop: -8 },
  menuOverlay: { ...StyleSheet.absoluteFill, zIndex: 28, backgroundColor: "rgba(2,8,10,0.58)", paddingHorizontal: 16, paddingTop: 86, alignItems: "flex-end" },
  profileMenuCard: { width: "88%", maxWidth: 360, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,224,204,0.2)", backgroundColor: "rgba(9,17,20,0.98)", padding: 14 },
  profileMenuHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  profileMenuTitle: { color: "#fff8f1", fontSize: 20, fontWeight: "900" },
  profileMenuSubtitle: { color: "#8fa0a6", fontSize: 11, marginTop: 2 },
  closeButton: { width: 32, height: 32, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  closeButtonText: { color: "#c8d3d6", fontSize: 11, fontWeight: "900" },
  profileMenuItem: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 7, paddingHorizontal: 9, marginBottom: 5 },
  profileMenuItemActive: { backgroundColor: "rgba(243,166,117,0.13)" },
  profileAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#21434a" },
  profileAvatarText: { color: "#dffaff", fontSize: 13, fontWeight: "900" },
  profileMenuName: { flex: 1, color: "#eef4f6", fontSize: 13, fontWeight: "700" },
  profileMenuArrow: { color: "#73868d", fontSize: 14 },
  addProfileButton: { marginTop: 8, height: 42, borderRadius: 7, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(243,166,117,0.42)" },
  addProfileText: { color: "#f3c5a8", fontSize: 12, fontWeight: "800" },
  profileModal: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(2,8,10,0.68)", justifyContent: "center", alignItems: "center", zIndex: 30 },
  profileCard: { width: "88%", maxWidth: 420, backgroundColor: "rgba(12,19,22,0.96)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 8, padding: 18 },
  profileCardTitle: { color: "#f7fbff", fontSize: 24, fontWeight: "900", marginBottom: 4 },
  profileCardSubtitle: { color: "#b8c5c9", fontSize: 12, marginBottom: 12 },
  existingLabel: { color: "#82949a", fontSize: 10, fontWeight: "800", marginBottom: 8 },
  profilePresetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  presetButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.04)" },
  presetButtonActive: { backgroundColor: "rgba(255,137,77,0.18)", borderColor: "rgba(255,137,77,0.75)" },
  presetButtonText: { color: "#edf4f6", fontSize: 11, fontWeight: "700" },
  profileInput: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, color: "#fff", backgroundColor: "rgba(255,255,255,0.03)", fontSize: 15 },
  profileActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)", marginRight: 8, alignItems: "center" },
  cancelButtonText: { color: "#dfeaf0", fontWeight: "700" },
  saveProfileButton: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#f3a675", alignItems: "center", marginLeft: 8 },
  saveProfileButtonFull: { marginLeft: 0 },
  saveProfileButtonText: { color: "#1b0f0a", fontWeight: "900" },
  fullPlayer: { ...StyleSheet.absoluteFill, zIndex: 35, backgroundColor: "#071014", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  fullPlayerHeader: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fullHeaderCopy: { flex: 1, alignItems: "center", paddingHorizontal: 10 },
  fullIconButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  fullKicker: { color: "#f3a675", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  fullAlbum: { color: "#b7c4c9", fontSize: 11, marginTop: 3, maxWidth: 230 },
  fullArtwork: { width: "82%", maxWidth: 370, aspectRatio: 1, alignSelf: "center", borderRadius: 8, backgroundColor: "#101b1f", marginTop: 6, marginBottom: 16 },
  fullSongRow: { flexDirection: "row", alignItems: "center", minHeight: 54 },
  fullSongCopy: { flex: 1, minWidth: 0 },
  fullTitle: { color: "#f7f9fa", fontSize: 22, fontWeight: "900" },
  fullArtist: { color: "#94a3a9", fontSize: 13, marginTop: 5 },
  fullProgressHit: { paddingVertical: 12 },
  fullProgress: { height: 4, borderRadius: 2, backgroundColor: "#29363b", overflow: "hidden" },
  fullControls: { height: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  fullPlay: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#f3a675", alignItems: "center", justifyContent: "center" },
  toolRow: { flexDirection: "row", justifyContent: "center", gap: 14, marginBottom: 8 },
  toolButton: { minWidth: 72, height: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 19, backgroundColor: "#0c181c" },
  toolText: { color: "#b8c5c9", fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  panelTabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1f2c31" },
  panelTab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  panelTabActive: { borderBottomWidth: 2, borderBottomColor: "#f3a675" },
  panelTabText: { color: "#d9e2e5", fontSize: 12, fontWeight: "800" },
  panelBody: { flex: 1, marginTop: 8 },
  lyricsBody: { paddingBottom: 30 },
  lyricsText: { color: "#ecf2f3", fontSize: 18, lineHeight: 30, textAlign: "center", paddingHorizontal: 8 },
  syncedLyricLine: { minHeight: 42, color: "#627177", fontSize: 17, lineHeight: 25, textAlign: "center", paddingHorizontal: 8, paddingVertical: 7 },
  syncedLyricActive: { color: "#fff5ee", fontSize: 20, fontWeight: "900" },
  syncedLyricPast: { color: "#9aa8ad" },
  lyricsCredit: { color: "#728187", fontSize: 10, textAlign: "center", marginTop: 18 },
  queueRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, borderRadius: 6 },
  queueRowActive: { backgroundColor: "rgba(243,166,117,0.13)" },
  queueIndex: { width: 24, color: "#f3a675", fontSize: 12, textAlign: "center" },
  toast: { position: "absolute", left: 20, right: 20, bottom: 178, zIndex: 50, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 8, backgroundColor: "#101c1f", borderWidth: 1, borderColor: "rgba(88,214,141,0.3)", elevation: 20 },
  toastText: { color: "#eef5f3", fontSize: 12, fontWeight: "800" },
  songMenuOverlay: { ...StyleSheet.absoluteFill, zIndex: 55, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.66)" },
  songMenuSheet: { paddingHorizontal: 18, paddingTop: 9, paddingBottom: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: "#091216", borderWidth: 1, borderBottomWidth: 0, borderColor: "rgba(255,255,255,0.12)" },
  sheetHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#405056", marginBottom: 14 },
  sheetSongHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 15 },
  sheetArtwork: { width: 54, height: 54, borderRadius: 7, backgroundColor: "#152126" },
  sheetTitle: { color: "#f5f7f8", fontSize: 15, fontWeight: "900" },
  sheetArtist: { color: "#87969c", fontSize: 12, marginTop: 4 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  sheetDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginBottom: 5 },
  sheetAction: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  sheetActionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.045)" },
  sheetActionText: { flex: 1, color: "#dce6e9", fontSize: 13, fontWeight: "700" },
  playlistModalOverlay: { ...StyleSheet.absoluteFill, zIndex: 58, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.72)" },
  playlistPickerCard: { width: "100%", maxWidth: 430, maxHeight: "72%", padding: 16, borderRadius: 10, backgroundColor: "#091216", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  createPlaylistCard: { width: "100%", maxWidth: 400, padding: 18, borderRadius: 10, backgroundColor: "#091216", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  playlistPickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  playlistPickerTitle: { color: "#f7f9fa", fontSize: 20, fontWeight: "900", marginBottom: 4 },
  playlistPickerSubtitle: { color: "#819096", fontSize: 11, maxWidth: 250 },
  playlistChoice: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  playlistChoiceName: { color: "#e9f0f2", fontSize: 13, fontWeight: "800" },
  playlistChoiceCount: { color: "#718087", fontSize: 10, marginTop: 3 },
  createPlaylistChoice: { height: 44, marginTop: 12, borderRadius: 7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#f3a675" },
  createPlaylistChoiceText: { color: "#071014", fontSize: 12, fontWeight: "900" },
});
