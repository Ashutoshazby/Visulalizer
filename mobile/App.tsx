import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, FlatList, Image, ImageBackground, Keyboard, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || "https://visulalizer-api.onrender.com";

type Song = { id: string; title: string; artist?: string; album?: string; language?: string; artwork?: string };

export default function App() {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const playback = useAudioPlayerStatus(player);
  const queueRef = useRef<Song[]>([]);
  const indexRef = useRef(-1);
  const progressWidth = useRef(1);
  const finishedSongRef = useRef<string | null>(null);
  const waveMotion = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Gathering your evening mix...");
  const [introVisible, setIntroVisible] = useState(true);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" })
      .catch((error) => console.warn("Audio mode failed", error));
    loadRecommendations();
    const introTimer = setTimeout(() => setIntroVisible(false), 1900);
    const waveAnimation = Animated.loop(Animated.sequence([
      Animated.timing(waveMotion, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(waveMotion, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    waveAnimation.start();
    return () => { clearTimeout(introTimer); waveAnimation.stop(); };
  }, []);

  const playSong = useCallback((song: Song, queue = queueRef.current) => {
    const index = queue.findIndex((item) => item.id === song.id);
    queueRef.current = queue;
    indexRef.current = index >= 0 ? index : 0;
    finishedSongRef.current = null;
    setCurrentSong(song);
    setMessage("");
    player.replace(streamUrl(song.id));
    player.setActiveForLockScreen(true, {
      title: song.title,
      artist: song.artist || "Saanjh Music",
      albumTitle: song.album || "Evening mix",
      artworkUrl: song.artwork,
    });
    player.play();
  }, [player]);

  const playAt = useCallback((index: number) => {
    const queue = queueRef.current;
    if (!queue.length) return;
    const wrapped = (index + queue.length) % queue.length;
    playSong(queue[wrapped], queue);
  }, [playSong]);

  useEffect(() => {
    if (!playback.didJustFinish || !currentSong || finishedSongRef.current === currentSong.id) return;
    finishedSongRef.current = currentSong.id;
    playAt(indexRef.current + 1);
  }, [currentSong, playAt, playback.didJustFinish]);

  useEffect(() => {
    if (!playback.error) return;
    console.warn("Playback failed", { songId: currentSong?.id, error: playback.error });
    setMessage("This song could not play. Try another track.");
  }, [currentSong?.id, playback.error]);

  async function loadRecommendations() {
    setLoading(true);
    setMessage("Gathering your evening mix...");
    try {
      const nextSongs = await fetchSongs("/api/music/recommendations?mood=auto&language=auto&limit=30");
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
    try {
      const nextSongs = await fetchSongs(`/api/music/search?query=${encodeURIComponent(cleanQuery)}&language=auto&limit=30`);
      queueRef.current = nextSongs;
      setSongs(nextSongs);
      setMessage(nextSongs.length ? "" : "No songs found. Try another name.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  function togglePlayback() {
    if (!currentSong) {
      if (songs[0]) playSong(songs[0], songs);
      return;
    }
    if (playback.playing) player.pause();
    else player.play();
  }

  function seek(locationX: number) {
    if (!playback.duration) return;
    const ratio = Math.max(0, Math.min(1, locationX / progressWidth.current));
    player.seekTo(playback.duration * ratio);
  }

  return (
    <ImageBackground source={require("./assets/saanjh-sunset.png")} style={styles.background} resizeMode="cover">
    <View style={styles.backdrop} />
    <Animated.View style={[styles.nativeWave, styles.nativeWaveFar, { transform: [{ translateX: waveMotion.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] }) }] }]} />
    <Animated.View style={[styles.nativeWave, styles.nativeWaveNear, { transform: [{ translateX: waveMotion.interpolate({ inputRange: [0, 1], outputRange: [20, -16] }) }] }]} />
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {introVisible ? <View style={styles.intro}><Text style={styles.introKicker}>MUSIC FOR SLOW EVENINGS</Text><Text style={styles.introTitle}>SAANJH</Text><Text style={styles.introCredit}>Made by Ashu</Text></View> : null}
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>MUSIC FOR SLOW EVENINGS</Text><Text style={styles.title}>Saanjh</Text><Text style={styles.credit}>Made by Ashu</Text></View>
        <Pressable style={styles.mixButton} onPress={loadRecommendations}><Text style={styles.mixButtonText}>NEW MIX</Text></Pressable>
      </View>
      <View style={styles.searchRow}>
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" placeholder="Song, artist or album" placeholderTextColor="#728087" />
        <Pressable style={styles.searchButton} onPress={search}><Text style={styles.searchButtonText}>SEARCH</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator color="#70ddef" style={styles.loader} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable style={[styles.songRow, item.id === currentSong?.id && styles.songRowActive]} onPress={() => playSong(item, songs)}>
            {item.artwork ? <Image source={{ uri: item.artwork }} style={styles.thumb} /> : <View style={styles.thumbFallback}><Text style={styles.note}>♪</Text></View>}
            <View style={styles.songCopy}><Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.songArtist} numberOfLines={1}>{item.artist || item.album || "Unknown artist"}</Text></View>
            <Text style={styles.rowAction}>{item.id === currentSong?.id && playback.playing ? "II" : "▶"}</Text>
          </Pressable>
        )}
      />
      <View style={styles.player}>
        <View style={styles.nowPlaying}>
          {currentSong?.artwork ? <Image source={{ uri: currentSong.artwork }} style={styles.playerArtwork} /> : <View style={styles.playerArtwork} />}
          <View style={styles.playerCopy}><Text style={styles.playerTitle} numberOfLines={1}>{currentSong?.title || "Choose a song"}</Text><Text style={styles.playerArtist} numberOfLines={1}>{currentSong?.artist || "Ready when you are"}</Text></View>
          {playback.isBuffering ? <ActivityIndicator color="#70ddef" /> : null}
        </View>
        <Pressable style={styles.progressHit} onLayout={(event) => { progressWidth.current = event.nativeEvent.layout.width; }} onPress={(event) => seek(event.nativeEvent.locationX)}>
          <View style={styles.progressTrack}><View style={[styles.progressLive, { width: `${playback.duration ? Math.min(100, (playback.currentTime / playback.duration) * 100) : 0}%` }]} /></View>
        </Pressable>
        <View style={styles.times}><Text style={styles.time}>{formatTime(playback.currentTime)}</Text><Text style={styles.time}>{formatTime(playback.duration)}</Text></View>
        <View style={styles.controls}>
          <Pressable style={styles.controlButton} onPress={() => playAt(indexRef.current - 1)}><Text style={styles.controlText}>◀</Text></Pressable>
          <Pressable style={styles.playButton} onPress={togglePlayback}><Text style={styles.playText}>{playback.playing ? "PAUSE" : "PLAY"}</Text></Pressable>
          <Pressable style={styles.controlButton} onPress={() => playAt(indexRef.current + 1)}><Text style={styles.controlText}>▶</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
    </ImageBackground>
  );
}

async function fetchSongs(path: string): Promise<Song[]> {
  const response = await fetch(`${API_BASE}${path}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) throw new Error(json.error || `Music service returned ${response.status}`);
  return json.songs || [];
}

function streamUrl(id: string) { return `${API_BASE}/api/music/stream?id=${encodeURIComponent(id)}`; }
function formatTime(value = 0) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: "#071014" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(4, 10, 13, 0.54)" },
  safeArea: { flex: 1 },
  nativeWave: { position: "absolute", left: -40, right: -40, height: 80, borderTopWidth: 2, borderColor: "rgba(231, 249, 246, 0.34)", borderRadius: 200 },
  nativeWaveFar: { bottom: 250, opacity: 0.5 },
  nativeWaveNear: { bottom: 175, height: 110, opacity: 0.68 },
  intro: { ...StyleSheet.absoluteFill, zIndex: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5, 12, 15, 0.72)" },
  introKicker: { color: "#ffc49f", fontSize: 10, fontWeight: "800", letterSpacing: 2.4, marginBottom: 12 },
  introTitle: { color: "#fff9f2", fontFamily: "serif", fontSize: 58, letterSpacing: 4 },
  introCredit: { color: "rgba(255, 231, 211, 0.78)", fontSize: 12, letterSpacing: 1, marginTop: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  eyebrow: { color: "#ffc49f", fontSize: 9, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: "#fff9f2", fontFamily: "serif", fontSize: 34, marginTop: 1 },
  credit: { color: "rgba(255, 231, 211, 0.7)", fontSize: 10, marginTop: -2 },
  mixButton: { borderWidth: 1, borderColor: "#314047", borderRadius: 6, paddingHorizontal: 13, paddingVertical: 9 },
  mixButtonText: { color: "#c9d5d9", fontSize: 11, fontWeight: "800" },
  searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  searchInput: { flex: 1, height: 46, borderWidth: 1, borderColor: "#27343a", borderRadius: 7, backgroundColor: "#0d1317", color: "#f5f8fa", paddingHorizontal: 13 },
  searchButton: { height: 46, justifyContent: "center", paddingHorizontal: 14, borderRadius: 7, backgroundColor: "#774431" },
  searchButtonText: { color: "#dffaff", fontSize: 11, fontWeight: "900" },
  loader: { marginVertical: 8 },
  message: { color: "#9ba9af", fontSize: 13, paddingHorizontal: 20, paddingVertical: 8 },
  list: { paddingHorizontal: 14, paddingBottom: 182 },
  songRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 7, borderWidth: 1, borderColor: "transparent", borderRadius: 7 },
  songRowActive: { backgroundColor: "rgba(112, 58, 39, 0.72)", borderColor: "#a66a4f" },
  thumb: { width: 50, height: 50, borderRadius: 5, backgroundColor: "#11191d" },
  thumbFallback: { width: 50, height: 50, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: "#11191d" },
  note: { color: "#70ddef", fontSize: 19 }, songCopy: { flex: 1, minWidth: 0 },
  songTitle: { color: "#edf3f5", fontSize: 14, fontWeight: "700" }, songArtist: { color: "#87969c", fontSize: 12, marginTop: 4 },
  rowAction: { width: 30, color: "#70ddef", fontSize: 13, textAlign: "center" },
  player: { position: "absolute", left: 10, right: 10, bottom: 8, padding: 13, borderWidth: 1, borderColor: "rgba(255, 221, 198, 0.25)", borderRadius: 8, backgroundColor: "rgba(7, 14, 16, 0.92)" },
  nowPlaying: { flexDirection: "row", alignItems: "center", gap: 11 }, playerArtwork: { width: 48, height: 48, borderRadius: 5, backgroundColor: "#121b1f" },
  playerCopy: { flex: 1, minWidth: 0 }, playerTitle: { color: "#f5f8fa", fontSize: 15, fontWeight: "800" }, playerArtist: { color: "#8f9ea4", fontSize: 12, marginTop: 3 },
  progressHit: { paddingVertical: 10 }, progressTrack: { height: 3, borderRadius: 2, backgroundColor: "#273238", overflow: "hidden" }, progressLive: { height: "100%", backgroundColor: "#f3a675" },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: -5 }, time: { color: "#77868c", fontSize: 10, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 4 },
  controlButton: { width: 48, height: 38, borderWidth: 1, borderColor: "#2b393f", borderRadius: 7, alignItems: "center", justifyContent: "center" }, controlText: { color: "#dbe5e8", fontSize: 13 },
  playButton: { minWidth: 112, height: 42, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#f3a675" }, playText: { color: "#1c0d08", fontSize: 13, fontWeight: "900" },
});
