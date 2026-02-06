export const schemaStatements = [
  `
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  tidal_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  artist_id INTEGER,
  artist_name TEXT,
  album_id INTEGER,
  album_name TEXT,
  duration_seconds INTEGER,
  isrc TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
  `,
  `
CREATE TABLE IF NOT EXISTS audio_features (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
  bpm REAL,
  key TEXT,
  energy REAL,
  danceability REAL,
  valence REAL,
  acousticness REAL,
  instrumentalness REAL,
  analyzed_at DATETIME
);
  `,
  `
CREATE TABLE IF NOT EXISTS track_metadata (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
  genres TEXT,
  moods TEXT,
  tags TEXT,
  musicbrainz_id TEXT,
  enriched_at DATETIME
);
  `,
  `
CREATE TABLE IF NOT EXISTS track_metadata_extended (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
  release_year INTEGER,
  genres TEXT,
  tags TEXT,
  popularity INTEGER,
  artist_followers INTEGER,
  discovered_via TEXT,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
  `,
  `
CREATE TABLE IF NOT EXISTS taste_signals (
  id INTEGER PRIMARY KEY,
  track_id INTEGER REFERENCES tracks(id),
  signal_type TEXT NOT NULL,
  signal_source TEXT,
  timestamp DATETIME,
  metadata TEXT
);
  `,
  `
CREATE TABLE IF NOT EXISTS listening_history (
  id INTEGER PRIMARY KEY,
  track_id INTEGER REFERENCES tracks(id),
  period TEXT,
  source_mix_id TEXT,
  position INTEGER,
  synced_at DATETIME
);
  `,
  `
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY,
  name TEXT,
  mood TEXT,
  duration_minutes INTEGER,
  track_count INTEGER,
  created_at DATETIME,
  metadata TEXT
);
  `,
  `
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id INTEGER REFERENCES playlists(id),
  track_id INTEGER REFERENCES tracks(id),
  position INTEGER,
  PRIMARY KEY (playlist_id, position)
);
  `,
  `
CREATE TABLE IF NOT EXISTS discovery_cache (
  id INTEGER PRIMARY KEY,
  query_hash TEXT UNIQUE,
  source TEXT,
  track_ids TEXT,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);
  `,
];
