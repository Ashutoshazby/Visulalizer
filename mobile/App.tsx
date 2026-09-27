import * as FileSystem from "expo-file-system/legacy";
import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, AppState, BackHandler, Easing, FlatList, Image, ImageBackground, Keyboard, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || "https://saanjh-music-api.vercel.app";
const PROFILE_FILE = `${FileSystem.documentDirectory ?? "file:///"}saanjh-profile.json`;

type Song = { id: string; title: string; artist?: string; album?: string; language?: string; artwork?: string };
type TabKey = "home" | "library";
type RepeatMode = "off" | "all" | "one";

export default function App() {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const playback = useAudioPlayerStatus(player);
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
  const waveMotion = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const compactLayout = width < 420;

  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Gathering your evening mix...");
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

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  useEffect(() => { profileModalRef.current = showProfileSetup; }, [showProfileSetup]);
  useEffect(() => { profileMenuRef.current = showProfileMenu; }, [showProfileMenu]);
  useEffect(() => { shuffleRef.current = shuffleEnabled; }, [shuffleEnabled]);
  useEffect(() => { repeatRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { playbackPlayingRef.current = playback.playing; }, [playback.playing]);

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
    } catch {
      setLibrarySongs([]);
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
      Alert.alert("Saved", `${song.title} added to ${safeUser}'s favorite songs.`);
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
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch((error) => console.warn("Audio mode failed", error));

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (resumeRequestedRef.current && currentSongRef.current) {
          player.play();
        }
        return;
      }

      if (playbackPlayingRef.current && (nextState === "background" || nextState === "inactive")) {
        resumeRequestedRef.current = true;
      }
    });

    loadRecommendations();
    const introTimer = setTimeout(() => setIntroVisible(false), 1900);
    const waveAnimation = Animated.loop(Animated.sequence([
      Animated.timing(waveMotion, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(waveMotion, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    waveAnimation.start();
    return () => {
      clearTimeout(introTimer);
      waveAnimation.stop();
      appStateSubscription.remove();
    };
  }, [waveMotion]);

  useEffect(() => {
    const exitSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
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
  }, []);

  const playSong = useCallback((song: Song, queue = queueRef.current) => {
    const index = queue.findIndex((item) => item.id === song.id);
    queueRef.current = queue;
    indexRef.current = index >= 0 ? index : 0;
    finishedSongRef.current = null;
    resumeRequestedRef.current = true;
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

  const changeTrack = useCallback((direction: -1 | 1, fromEnded = false) => {
    const queue = queueRef.current;
    if (!queue.length) return;
    if (fromEnded && repeatRef.current === "one") {
      player.seekTo(0);
      player.play();
      return;
    }
    if (direction > 0 && shuffleRef.current && queue.length > 1) {
      let nextIndex = indexRef.current;
      while (nextIndex === indexRef.current) nextIndex = Math.floor(Math.random() * queue.length);
      playAt(nextIndex);
      return;
    }
    const nextIndex = indexRef.current + direction;
    if (fromEnded && repeatRef.current === "off" && nextIndex >= queue.length) {
      resumeRequestedRef.current = false;
      return;
    }
    playAt(nextIndex);
  }, [playAt, player]);

  useEffect(() => {
    if (!playback.didJustFinish || !currentSong || finishedSongRef.current === currentSong.id) return;
    finishedSongRef.current = currentSong.id;
    changeTrack(1, true);
  }, [changeTrack, currentSong, playback.didJustFinish]);

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
    if (playback.playing) {
      player.pause();
      resumeRequestedRef.current = false;
      return;
    }

    resumeRequestedRef.current = true;
    player.play();
  }

  function seek(locationX: number) {
    if (!playback.duration) return;
    const ratio = Math.max(0, Math.min(1, locationX / progressWidth.current));
    player.seekTo(playback.duration * ratio);
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
      await refreshLibraryUsers();
    } catch (error) {
      Alert.alert("Remove failed", error instanceof Error ? error.message : "Could not remove favorite.");
    }
  }, [refreshLibraryUsers, selectedUser]);

  function cycleRepeat() {
    setRepeatMode((current) => current === "off" ? "all" : current === "all" ? "one" : "off");
  }

  const renderHomeList = () => (
    <>
      <View style={[styles.header, compactLayout && styles.headerCompact]}>
        <View style={styles.brandRow}>
          <Image source={require("./assets/saanjh-logo.png")} style={styles.brandLogo} />
          <View style={styles.headerBrand}>
            <Text style={styles.eyebrow}>MUSIC FOR SLOW EVENINGS</Text>
            <Text style={styles.title}>Saanjh</Text>
            <Text style={styles.credit}>Made by Ashu</Text>
          </View>
        </View>
        <Pressable style={[styles.mixButton, compactLayout && styles.mixButtonCompact]} onPress={loadRecommendations}>
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
        <TextInput style={[styles.searchInput, compactLayout && styles.searchInputCompact]} value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" placeholder="Song, artist or album" placeholderTextColor="#728087" />
        <Pressable style={[styles.searchButton, compactLayout && styles.searchButtonCompact]} onPress={search}><Text style={styles.searchButtonText}>SEARCH</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator color="#70ddef" style={styles.loader} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, compactLayout && styles.listCompact]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable style={[styles.songRow, item.id === currentSong?.id && styles.songRowActive]} onPress={() => playSong(item, songs)}>
            {item.artwork ? <Image source={{ uri: item.artwork }} style={styles.thumb} /> : <View style={styles.thumbFallback}><Text style={styles.note}>♪</Text></View>}
            <View style={styles.songCopy}><Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.songArtist} numberOfLines={1}>{item.artist || item.album || "Unknown artist"}</Text></View>
            <Text style={styles.rowAction}>{item.id === currentSong?.id && playback.playing ? "II" : "▶"}</Text>
          </Pressable>
        )}
      />
    </>
  );

  const renderLibraryView = () => (
    <View style={styles.libraryWrap}>
      <View style={styles.libraryHeader}>
        <View>
          <Text style={styles.libraryTitle}>Shared library</Text>
          <Text style={styles.libraryMeta}>{selectedUser ? `${selectedUser}'s favorite songs` : "Choose a profile"}</Text>
        </View>
        <Pressable style={styles.menuButton} onPress={() => setShowProfileMenu(true)}><Text style={styles.menuButtonText}>...</Text></Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileList}>
        {libraryUsers.map((profile) => (
          <Pressable key={profile} style={[styles.profilePill, selectedUser === profile && styles.profilePillActive]} onPress={() => switchProfile(profile)}>
            <Text style={styles.profilePillText}>{profile}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.libraryMessage}>{libraryMessage}</Text>

      <FlatList
        data={librarySongs}
        keyExtractor={(item) => `${selectedUser}-${item.id}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable style={[styles.songRow, item.id === currentSong?.id && styles.songRowActive]} onPress={() => playSong(item, librarySongs)}>
            {item.artwork ? <Image source={{ uri: item.artwork }} style={styles.thumb} /> : <View style={styles.thumbFallback}><Text style={styles.note}>♪</Text></View>}
            <View style={styles.songCopy}><Text style={styles.songTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.songArtist} numberOfLines={1}>{item.artist || item.album || "Unknown artist"}</Text></View>
            <Pressable style={styles.removeButton} onPress={(event) => { event.stopPropagation(); void removeSongFromLibrary(item); }}><Text style={styles.removeButtonText}>X</Text></Pressable>
            <Text style={styles.rowAction}>{item.id === currentSong?.id && playback.playing ? "II" : ">"}</Text>
          </Pressable>
        )}
      />
    </View>
  );

  return (
    <ImageBackground source={require("./assets/saanjh-sunset.png")} style={styles.background} resizeMode="cover">
      <View style={styles.backdrop} />
      <Animated.View style={[styles.nativeWave, styles.nativeWaveFar, { transform: [{ translateX: waveMotion.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] }) }] }]} />
      <Animated.View style={[styles.nativeWave, styles.nativeWaveNear, { transform: [{ translateX: waveMotion.interpolate({ inputRange: [0, 1], outputRange: [20, -16] }) }] }]} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        {introVisible ? <View style={styles.intro}><Image source={require("./assets/saanjh-logo.png")} style={styles.introLogo} /><Text style={styles.introKicker}>MUSIC FOR SLOW EVENINGS</Text><Text style={styles.introTitle}>SAANJH</Text><Text style={styles.introCredit}>Made by Ashu</Text></View> : null}

        {activeTab === "home" ? renderHomeList() : renderLibraryView()}

        <View style={[styles.player, compactLayout && styles.playerCompact]}>
          <View style={styles.nowPlaying}>
            {currentSong?.artwork ? <Image source={{ uri: currentSong.artwork }} style={styles.playerArtwork} /> : <View style={styles.playerArtwork} />}
            <View style={styles.playerCopy}><Text style={styles.playerTitle} numberOfLines={1}>{currentSong?.title || "Choose a song"}</Text><Text style={styles.playerArtist} numberOfLines={1}>{currentSong?.artist || "Ready when you are"}</Text></View>
            <Pressable style={styles.saveButton} onPress={() => saveSongToLibrary(currentSong)}>
              <Text style={styles.saveButtonText}>SAVE</Text>
            </Pressable>
            {playback.isBuffering ? <ActivityIndicator color="#70ddef" /> : null}
          </View>
          <Pressable style={styles.progressHit} onLayout={(event) => { progressWidth.current = event.nativeEvent.layout.width; }} onPress={(event) => seek(event.nativeEvent.locationX)}>
            <View style={styles.progressTrack}><View style={[styles.progressLive, { width: `${playback.duration ? Math.min(100, (playback.currentTime / playback.duration) * 100) : 0}%` }]} /></View>
          </Pressable>
          <View style={styles.times}><Text style={styles.time}>{formatTime(playback.currentTime)}</Text><Text style={styles.time}>{formatTime(playback.duration)}</Text></View>
          <View style={styles.controls}>
            <Pressable style={[styles.modeButton, shuffleEnabled && styles.modeButtonActive]} onPress={() => setShuffleEnabled((value) => !value)}><Text style={styles.modeText}>SHUF</Text></Pressable>
            <Pressable style={[styles.controlButton, compactLayout && styles.controlButtonCompact]} onPress={() => changeTrack(-1)}><Text style={styles.controlText}>|&lt;</Text></Pressable>
            <Pressable style={[styles.playButton, compactLayout && styles.playButtonCompact]} onPress={togglePlayback}><Text style={styles.playText}>{playback.playing ? "II" : ">"}</Text></Pressable>
            <Pressable style={[styles.controlButton, compactLayout && styles.controlButtonCompact]} onPress={() => changeTrack(1)}><Text style={styles.controlText}>&gt;|</Text></Pressable>
            <Pressable style={[styles.modeButton, repeatMode !== "off" && styles.modeButtonActive]} onPress={cycleRepeat}><Text style={styles.modeText}>{repeatMode === "one" ? "RPT 1" : "RPT"}</Text></Pressable>
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
  introLogo: { width: 86, height: 86, borderRadius: 20, marginBottom: 18 },
  introKicker: { color: "#ffc49f", fontSize: 10, fontWeight: "800", letterSpacing: 2.4, marginBottom: 12 },
  introTitle: { color: "#fff9f2", fontFamily: "serif", fontSize: 58, letterSpacing: 4 },
  introCredit: { color: "rgba(255, 231, 211, 0.78)", fontSize: 12, letterSpacing: 1, marginTop: 14 },
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
  loader: { marginVertical: 8 },
  message: { color: "#9ba9af", fontSize: 13, paddingHorizontal: 20, paddingVertical: 8 },
  list: { paddingHorizontal: 14, paddingBottom: 205 },
  listCompact: { paddingBottom: 220 },
  songRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 7, borderWidth: 1, borderColor: "transparent", borderRadius: 7 },
  songRowActive: { backgroundColor: "rgba(112, 58, 39, 0.72)", borderColor: "#a66a4f" },
  thumb: { width: 50, height: 50, borderRadius: 5, backgroundColor: "#11191d" },
  thumbFallback: { width: 50, height: 50, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: "#11191d" },
  note: { color: "#70ddef", fontSize: 19 },
  songCopy: { flex: 1, minWidth: 0 },
  songTitle: { color: "#edf3f5", fontSize: 14, fontWeight: "700" },
  songArtist: { color: "#87969c", fontSize: 12, marginTop: 4 },
  rowAction: { width: 30, color: "#70ddef", fontSize: 13, textAlign: "center" },
  removeButton: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.05)" },
  removeButtonText: { color: "#a9b7bc", fontSize: 10, fontWeight: "900" },
  player: { position: "absolute", left: 10, right: 10, bottom: 8, padding: 13, borderWidth: 1, borderColor: "rgba(255, 221, 198, 0.25)", borderRadius: 8, backgroundColor: "rgba(7, 14, 16, 0.92)" },
  playerCompact: { left: 8, right: 8, bottom: 6, padding: 11 },
  nowPlaying: { flexDirection: "row", alignItems: "center", gap: 11 },
  playerArtwork: { width: 54, height: 54, borderRadius: 7, backgroundColor: "#121b1f" },
  playerCopy: { flex: 1, minWidth: 0 },
  playerTitle: { color: "#f5f8fa", fontSize: 15, fontWeight: "800" },
  playerArtist: { color: "#8f9ea4", fontSize: 12, marginTop: 3 },
  saveButton: { borderRadius: 6, backgroundColor: "rgba(255,172,124,0.2)", borderWidth: 1, borderColor: "rgba(255,172,124,0.7)", paddingHorizontal: 10, paddingVertical: 8 },
  saveButtonText: { color: "#f4d1b7", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  progressHit: { paddingVertical: 10 },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: "#273238", overflow: "hidden" },
  progressLive: { height: "100%", backgroundColor: "#f3a675" },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: -5 },
  time: { color: "#77868c", fontSize: 10, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7, marginTop: 3 },
  controlButton: { width: 42, height: 40, borderWidth: 1, borderColor: "#2b393f", borderRadius: 7, alignItems: "center", justifyContent: "center" },
  controlButtonCompact: { width: 38 },
  controlText: { color: "#dbe5e8", fontSize: 12, fontWeight: "800" },
  modeButton: { width: 43, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 7 },
  modeButtonActive: { backgroundColor: "rgba(112,221,239,0.14)" },
  modeText: { color: "#87969c", fontSize: 9, fontWeight: "900" },
  playButton: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#f3a675" },
  playButtonCompact: { width: 48, height: 48, borderRadius: 24 },
  playText: { color: "#1c0d08", fontSize: 17, fontWeight: "900" },
  libraryWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  libraryHeader: { paddingHorizontal: 6, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  libraryTitle: { color: "#f7f3ee", fontSize: 28, fontWeight: "900" },
  libraryMeta: { color: "#d1dfe4", fontSize: 12, marginTop: 4 },
  libraryMessage: { color: "#c9dbe0", fontSize: 12, marginBottom: 8, paddingHorizontal: 4 },
  profileList: { paddingVertical: 8, paddingHorizontal: 4 },
  profilePill: { paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(7,13,15,0.5)" },
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
});
