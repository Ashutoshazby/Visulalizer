export class MusicProvider {
  searchSongs() {
    throw new Error("searchSongs must be implemented by a provider.");
  }

  getSong() {
    throw new Error("getSong must be implemented by a provider.");
  }

  getStreamUrl() {
    throw new Error("getStreamUrl must be implemented by a provider.");
  }

  getArtwork() {
    throw new Error("getArtwork must be implemented by a provider.");
  }

  getRecommendations() {
    throw new Error("getRecommendations must be implemented by a provider.");
  }
}
