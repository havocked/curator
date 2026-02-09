const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applySchema,
  openDatabase,
  syncFavoriteTracks,
  getFavoritedTracks,
} = require("../dist/db");
const {
  formatTracksAsIds,
  formatTracksAsJson,
} = require("../dist/commands/library");

test("getFavoritedTracks returns favorites ordered by artist/title", () => {
  const db = openDatabase(":memory:");
  applySchema(db);

  const tracks = [
    { id: 2, title: "Zebra", artist: "Beach House", album: "Teen Dream", duration: 240 },
    { id: 1, title: "All I Need", artist: "Radiohead", album: "In Rainbows", duration: 210 },
  ];
  syncFavoriteTracks(db, tracks);

  const results = getFavoritedTracks(db, 10);
  assert.equal(results.length, 2);
  assert.equal(results[0].artist, "Beach House");
  assert.equal(results[1].artist, "Radiohead");

  db.close();
});

test("formatTracksAsIds outputs newline separated ids", () => {
  const output = formatTracksAsIds([
    { id: 10, title: "One", artist: "A", album: "A", duration: 100 },
    { id: 11, title: "Two", artist: "B", album: "B", duration: 120 },
  ]);
  assert.equal(output, "10\n11");
});

test("formatTracksAsJson outputs count and tracks", () => {
  const output = formatTracksAsJson([
    {
      id: 10,
      title: "One",
      artist: "A",
      album: "A",
      duration: 100,
      bpm: 120,
      key: "C major",
    },
  ]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.tracks[0].id, 10);
  assert.equal(parsed.tracks[0].artist, "A");
  assert.equal(parsed.tracks[0].audio_features.bpm, 120);
  assert.equal(parsed.tracks[0].audio_features.key, "C major");
});
