CREATE TABLE IF NOT EXISTS playlist_songs (
  profile_slug TEXT NOT NULL,
  song_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  language TEXT NOT NULL,
  artwork TEXT NOT NULL,
  added_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (profile_slug, song_id),
  FOREIGN KEY (profile_slug) REFERENCES profiles(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_playlist_profile_added
  ON playlist_songs(profile_slug, added_at DESC);
