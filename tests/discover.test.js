const test = require("node:test");
const assert = require("node:assert/strict");

const { applySchema, openDatabase, upsertDiscoveredTracks } = require("../dist/db");
const {
  filterTracks: filterDiscoverTracks,
  formatDiscoverAsJson,
  formatDiscoverAsIds,
  formatDiscoverAsText,
  parseTags,
  parseArtists,
  buildSearchQuery,
  dedupeTracks,
} = require("../dist/commands/discover");

test("upsertDiscoveredTracks stores metadata and audio features", () => {
  const db = openDatabase(":memory:");
  applySchema(db);

  const tracks = [
    {
      id: 101,
      title: "Track One",
      artist: "Artist A",
      album: "Album A",
      duration: 180,
      release_year: 2024,
      audio_features: { bpm: 120, key: "C major" },
    },
    {
      id: 102,
      title: "Track Two",
      artist: "Artist B",
      album: "Album B",
      duration: 200,
    },
  ];

  const result = upsertDiscoveredTracks(db, tracks, "playlist:test");
  assert.equal(result.upsertedTracks, 2);
  assert.equal(result.audioFeatures, 1);
  assert.equal(result.metadataRows, 2);

  const metadataCount = db
    .prepare("SELECT COUNT(*) as count FROM track_metadata_extended")
    .get().count;
  const audioCount = db
    .prepare("SELECT COUNT(*) as count FROM audio_features")
    .get().count;

  assert.equal(metadataCount, 2);
  assert.equal(audioCount, 1);

  db.close();
});

test("formatDiscoverAsJson includes audio features and release year", () => {
  const output = formatDiscoverAsJson(
    { playlist: "playlist-1", label: "ed banger", artists: ["Justice"], limit: 50 },
    [
      {
        id: 201,
        title: "Song",
        artist: "Artist",
        album: "Album",
        duration: 210,
        release_year: 2023,
        audio_features: { bpm: 95, key: "A minor" },
      },
    ],
    50
  );
  const parsed = JSON.parse(output);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.tracks[0].audio_features.bpm, 95);
  assert.equal(parsed.tracks[0].release_year, 2023);
  assert.equal(parsed.query.label, "ed banger");
  assert.deepEqual(parsed.query.artists, ["Justice"]);
});

test("formatDiscoverAsText and ids output", () => {
  const tracks = [
    {
      id: 301,
      title: "One",
      artist: "A",
      album: "A",
      duration: 100,
      release_year: 2020,
      audio_features: { bpm: 120, key: "C major" },
    },
    { id: 302, title: "Two", artist: "B", album: "B", duration: 110 },
  ];
  const textOutput = formatDiscoverAsText("playlist-x", tracks);
  assert.ok(textOutput.includes("Discovered 2 tracks"));
  assert.ok(textOutput.includes("One - A (A, 2020)"));
  assert.ok(textOutput.includes("[1:40]"));
  assert.ok(textOutput.includes("120 BPM"));
  assert.ok(textOutput.includes("C major"));

  const idsOutput = formatDiscoverAsIds(tracks);
  assert.equal(idsOutput, "301\n302");
});

test("parseTags and buildSearchQuery", () => {
  const tags = parseTags("boom-bap, Electro ");
  assert.deepEqual(tags, ["boom-bap", "electro"]);

  const query = buildSearchQuery("hip-hop", tags);
  assert.equal(query, "hip-hop boom-bap electro");

  // Genre only
  assert.equal(buildSearchQuery("jazz", []), "jazz");

  // Tags only
  assert.equal(buildSearchQuery(undefined, ["chill", "ambient"]), "chill ambient");

  // No duplicates
  assert.equal(buildSearchQuery("jazz", ["jazz", "latin"]), "jazz latin");
});

test("parseArtists splits comma-separated names", () => {
  const artists = parseArtists("Justice, SebastiAn, ");
  assert.deepEqual(artists, ["Justice", "SebastiAn"]);
});

test("filterDiscoverTracks filters by popularity and year", () => {
  const tracks = [
    { id: 1, title: "Old Hit", artist: "A", album: "X", duration: 200, release_year: 1995, popularity: 0.9, genres: [], mood: [], audio_features: { bpm: null, key: null } },
    { id: 2, title: "New Obscure", artist: "B", album: "Y", duration: 180, release_year: 2023, popularity: 0.1, genres: [], mood: [], audio_features: { bpm: null, key: null } },
    { id: 3, title: "New Hit", artist: "C", album: "Z", duration: 210, release_year: 2020, popularity: 0.8, genres: [], mood: [], audio_features: { bpm: null, key: null } },
    { id: 4, title: "No Data", artist: "D", album: "W", duration: 150, release_year: null, popularity: null, genres: [], mood: [], audio_features: { bpm: null, key: null } },
  ];

  // Popularity min
  const popular = filterDiscoverTracks(tracks, { popularityMin: 0.5 });
  assert.equal(popular.length, 2);
  assert.deepEqual(popular.map(t => t.id), [1, 3]);

  // Popularity max
  const obscure = filterDiscoverTracks(tracks, { popularityMax: 0.5 });
  assert.equal(obscure.length, 1);
  assert.equal(obscure[0].id, 2);

  // Year range
  const modern = filterDiscoverTracks(tracks, { yearMin: 2000 });
  assert.equal(modern.length, 2);
  assert.deepEqual(modern.map(t => t.id), [2, 3]);

  const nineties = filterDiscoverTracks(tracks, { yearMin: 1990, yearMax: 1999 });
  assert.equal(nineties.length, 1);
  assert.equal(nineties[0].id, 1);

  // Combined
  const modernHits = filterDiscoverTracks(tracks, { yearMin: 2010, popularityMin: 0.5 });
  assert.equal(modernHits.length, 1);
  assert.equal(modernHits[0].id, 3);

  // No filters = all tracks
  const all = filterDiscoverTracks(tracks, {});
  assert.equal(all.length, 4);
});

test("dedupeTracks removes duplicate ids", () => {
  const unique = dedupeTracks([
    { id: 1, title: "A", artist: "X", album: "Y", duration: 10 },
    { id: 1, title: "A", artist: "X", album: "Y", duration: 10 },
    { id: 2, title: "B", artist: "Z", album: "Q", duration: 12 },
  ]);
  assert.equal(unique.length, 2);
  assert.equal(unique[0].id, 1);
  assert.equal(unique[1].id, 2);
});
