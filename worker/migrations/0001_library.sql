CREATE TABLE IF NOT EXISTS profiles (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS favorites (
  profile_slug TEXT NOT NULL,
  song_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  language TEXT NOT NULL,
  artwork TEXT NOT NULL,
  saved_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (profile_slug, song_id),
  FOREIGN KEY (profile_slug) REFERENCES profiles(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_profile_saved
  ON favorites(profile_slug, saved_at DESC);
