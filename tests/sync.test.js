const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeBaseUrl,
  normalizeFavoritesResponse,
} = require("../dist/services/tidalService");
const { applySchema, openDatabase, syncFavoriteTracks } = require("../dist/db");

test("normalizeBaseUrl trims trailing slashes", () => {
  assert.equal(normalizeBaseUrl("http://localhost:3001/"), "http://localhost:3001");
  assert.equal(
    normalizeBaseUrl("http://localhost:3001////"),
    "http://localhost:3001"
  );
  assert.equal(normalizeBaseUrl("http://localhost:3001"), "http://localhost:3001");
});

test("normalizeFavoritesResponse uses payload counts when present", () => {
  const payload = {
    tracks_count: 12,
    albums_count: 3,
    artists_count: 7,
    favorites: {
      tracks: [{ id: 1, title: "Song", artist: "A", album: "B", duration: 120 }],
      albums: [],
      artists: [],
    },
  };

  const normalized = normalizeFavoritesResponse(payload);
  assert.equal(normalized.tracks_count, 12);
  assert.equal(normalized.albums_count, 3);
  assert.equal(normalized.artists_count, 7);
});

test("syncFavoriteTracks persists favorites without duplicating signals", () => {
  const db = openDatabase(":memory:");
  applySchema(db);

  const tracks = [
    {
      id: 1,
      title: "Track One",
      artist: "Artist A",
      album: "Album A",
      duration: 210,
      audio_features: { bpm: 120, key: "C major" },
    },
    { id: 2, title: "Track Two", artist: "Artist B", album: "Album B", duration: 180 },
  ];

  const first = syncFavoriteTracks(db, tracks);
  assert.equal(first.upsertedTracks, 2);
  assert.equal(first.favoriteSignals, 2);
  assert.equal(first.audioFeatures, 1);

  const second = syncFavoriteTracks(db, tracks);
  assert.equal(second.favoriteSignals, 2);

  const totalTracks = db
    .prepare("SELECT COUNT(*) as count FROM tracks")
    .get().count;
  const totalSignals = db
    .prepare("SELECT COUNT(*) as count FROM taste_signals")
    .get().count;
  const totalAudio = db
    .prepare("SELECT COUNT(*) as count FROM audio_features")
    .get().count;

  assert.equal(totalTracks, 2);
  assert.equal(totalSignals, 2);
  assert.equal(totalAudio, 1);

  db.close();
});
