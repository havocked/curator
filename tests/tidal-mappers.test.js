const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseDuration,
  formatKey,
  mapTrackResource,
  resolveTrackMeta,
  buildIncludedMap,
} = require("../dist/services/tidal/mappers");

// ─── parseDuration ───────────────────────────────────────────────────────────

test("parseDuration: full hours, minutes, seconds", () => {
  assert.equal(parseDuration("PT1H2M3S"), 3723);
});

test("parseDuration: minutes and seconds only", () => {
  assert.equal(parseDuration("PT3M45S"), 225);
});

test("parseDuration: seconds only", () => {
  assert.equal(parseDuration("PT30S"), 30);
});

test("parseDuration: hours only", () => {
  assert.equal(parseDuration("PT2H"), 7200);
});

test("parseDuration: minutes only", () => {
  assert.equal(parseDuration("PT5M"), 300);
});

test("parseDuration: zero duration", () => {
  assert.equal(parseDuration("PT0S"), 0);
});

test("parseDuration: returns 0 for null/undefined/empty", () => {
  assert.equal(parseDuration(null), 0);
  assert.equal(parseDuration(undefined), 0);
  assert.equal(parseDuration(""), 0);
});

test("parseDuration: returns 0 for garbage input", () => {
  assert.equal(parseDuration("not-a-duration"), 0);
  assert.equal(parseDuration("3:45"), 0);
  assert.equal(parseDuration("225"), 0);
});

test("parseDuration: handles large values", () => {
  assert.equal(parseDuration("PT10H59M59S"), 39599);
});

// ─── formatKey ───────────────────────────────────────────────────────────────

test("formatKey: standard key with scale", () => {
  assert.equal(formatKey("C", "MINOR"), "C minor");
  assert.equal(formatKey("A", "MAJOR"), "A major");
});

test("formatKey: sharp key gets # symbol", () => {
  assert.equal(formatKey("CSharp", "MINOR"), "C# minor");
  assert.equal(formatKey("FSharp", "MAJOR"), "F# major");
});

test("formatKey: only first Sharp is replaced (String.replace behavior)", () => {
  // API only sends single Sharp (CSharp, FSharp, etc.)
  // but if something weird came through, only the first gets replaced
  assert.equal(formatKey("GSharpSharp", "MINOR"), "G#Sharp minor");
});

test("formatKey: all standard sharp keys", () => {
  // These are the actual keys the Tidal API sends
  assert.equal(formatKey("ASharp", "MINOR"), "A# minor");
  assert.equal(formatKey("DSharp", "MAJOR"), "D# major");
  assert.equal(formatKey("GSharp", "MINOR"), "G# minor");
});

test("formatKey: key without scale", () => {
  assert.equal(formatKey("D", null), "D");
  assert.equal(formatKey("D", undefined), "D");
});

test("formatKey: UNKNOWN scale is ignored", () => {
  assert.equal(formatKey("E", "UNKNOWN"), "E");
});

test("formatKey: UNKNOWN key returns null", () => {
  assert.equal(formatKey("UNKNOWN", "MINOR"), null);
});

test("formatKey: null/undefined key returns null", () => {
  assert.equal(formatKey(null, "MAJOR"), null);
  assert.equal(formatKey(undefined, "MINOR"), null);
  assert.equal(formatKey("", "MAJOR"), null);
});

// ─── buildIncludedMap ────────────────────────────────────────────────────────

test("buildIncludedMap: builds type:id lookup", () => {
  const included = [
    { id: "1", type: "artists", attributes: { name: "Bonobo" } },
    { id: "99", type: "albums", attributes: { title: "Migration" } },
    { id: "5", type: "genres", attributes: { genreName: "Electronic" } },
  ];
  const map = buildIncludedMap(included);
  assert.equal(map.size, 3);
  assert.equal(map.get("artists:1").attributes.name, "Bonobo");
  assert.equal(map.get("albums:99").attributes.title, "Migration");
  assert.equal(map.get("genres:5").attributes.genreName, "Electronic");
});

test("buildIncludedMap: empty array returns empty map", () => {
  const map = buildIncludedMap([]);
  assert.equal(map.size, 0);
});

test("buildIncludedMap: duplicate type:id keeps last entry", () => {
  const included = [
    { id: "1", type: "artists", attributes: { name: "First" } },
    { id: "1", type: "artists", attributes: { name: "Second" } },
  ];
  const map = buildIncludedMap(included);
  assert.equal(map.size, 1);
  assert.equal(map.get("artists:1").attributes.name, "Second");
});

test("buildIncludedMap: same id different types are separate entries", () => {
  const included = [
    { id: "1", type: "artists", attributes: { name: "Bonobo" } },
    { id: "1", type: "albums", attributes: { title: "Black Sands" } },
  ];
  const map = buildIncludedMap(included);
  assert.equal(map.size, 2);
  assert.ok(map.has("artists:1"));
  assert.ok(map.has("albums:1"));
});

// ─── resolveTrackMeta ────────────────────────────────────────────────────────

test("resolveTrackMeta: resolves artist, album, releaseDate, genres", () => {
  const track = {
    id: "100",
    type: "tracks",
    attributes: {},
    relationships: {
      artists: { data: [{ id: "10", type: "artists" }] },
      albums: { data: [{ id: "20", type: "albums" }] },
      genres: { data: [{ id: "30", type: "genres" }] },
    },
  };
  const includedMap = new Map([
    ["artists:10", { id: "10", type: "artists", attributes: { name: "Tycho" } }],
    ["albums:20", { id: "20", type: "albums", attributes: { title: "Dive", releaseDate: "2011-11-14" } }],
    ["genres:30", { id: "30", type: "genres", attributes: { genreName: "Electronic" } }],
  ]);

  const meta = resolveTrackMeta(track, includedMap);
  assert.equal(meta.artistName, "Tycho");
  assert.equal(meta.albumTitle, "Dive");
  assert.equal(meta.releaseDate, "2011-11-14");
  assert.deepEqual(meta.genres, ["Electronic"]);
});

test("resolveTrackMeta: returns empty when no relationships", () => {
  const track = { id: "100", type: "tracks", attributes: {} };
  const meta = resolveTrackMeta(track, new Map());
  assert.equal(meta.artistName, undefined);
  assert.equal(meta.albumTitle, undefined);
  assert.equal(meta.releaseDate, undefined);
  assert.deepEqual(meta.genres, []);
});

test("resolveTrackMeta: handles missing included resources gracefully", () => {
  const track = {
    id: "100",
    type: "tracks",
    attributes: {},
    relationships: {
      artists: { data: [{ id: "999", type: "artists" }] },
      albums: { data: [{ id: "888", type: "albums" }] },
      genres: { data: [{ id: "777", type: "genres" }] },
    },
  };
  // IDs reference resources that don't exist in the included map
  const meta = resolveTrackMeta(track, new Map());
  assert.equal(meta.artistName, undefined);
  assert.equal(meta.albumTitle, undefined);
  assert.deepEqual(meta.genres, []);
});

test("resolveTrackMeta: multiple genres resolved in order", () => {
  const track = {
    id: "100",
    type: "tracks",
    attributes: {},
    relationships: {
      genres: {
        data: [
          { id: "1", type: "genres" },
          { id: "2", type: "genres" },
          { id: "3", type: "genres" },
        ],
      },
    },
  };
  const includedMap = new Map([
    ["genres:1", { id: "1", type: "genres", attributes: { genreName: "Electronic" } }],
    ["genres:2", { id: "2", type: "genres", attributes: { genreName: "Ambient" } }],
    ["genres:3", { id: "3", type: "genres", attributes: { genreName: "Downtempo" } }],
  ]);

  const meta = resolveTrackMeta(track, includedMap);
  assert.deepEqual(meta.genres, ["Electronic", "Ambient", "Downtempo"]);
});

test("resolveTrackMeta: skips genres with null/missing genreName", () => {
  const track = {
    id: "100",
    type: "tracks",
    attributes: {},
    relationships: {
      genres: {
        data: [
          { id: "1", type: "genres" },
          { id: "2", type: "genres" },
        ],
      },
    },
  };
  const includedMap = new Map([
    ["genres:1", { id: "1", type: "genres", attributes: { genreName: "Rock" } }],
    ["genres:2", { id: "2", type: "genres", attributes: { genreName: null } }],
  ]);

  const meta = resolveTrackMeta(track, includedMap);
  assert.deepEqual(meta.genres, ["Rock"]);
});

test("resolveTrackMeta: album with null releaseDate", () => {
  const track = {
    id: "100",
    type: "tracks",
    attributes: {},
    relationships: {
      albums: { data: [{ id: "20", type: "albums" }] },
    },
  };
  const includedMap = new Map([
    ["albums:20", { id: "20", type: "albums", attributes: { title: "Singles", releaseDate: null } }],
  ]);

  const meta = resolveTrackMeta(track, includedMap);
  assert.equal(meta.albumTitle, "Singles");
  assert.equal(meta.releaseDate, undefined);
});

// ─── mapTrackResource ────────────────────────────────────────────────────────

test("mapTrackResource: full track with all fields", () => {
  const resource = {
    id: "12345",
    type: "tracks",
    attributes: {
      title: "Kiara",
      version: null,
      duration: "PT4M30S",
      popularity: 72,
      bpm: 118,
      key: "CSharp",
      keyScale: "MINOR",
      createdAt: "2017-01-06T00:00:00Z",
      toneTags: ["energetic", "uplifting"],
    },
  };
  const meta = {
    artistName: "Bonobo",
    albumTitle: "Migration",
    releaseDate: "2017-01-13",
    genres: ["Electronic"],
  };

  const track = mapTrackResource(resource, meta);
  assert.equal(track.id, 12345);
  assert.equal(track.title, "Kiara");
  assert.equal(track.artist, "Bonobo");
  assert.equal(track.album, "Migration");
  assert.equal(track.duration, 270);
  assert.equal(track.release_year, 2017); // from meta.releaseDate
  assert.equal(track.popularity, 72);
  assert.deepEqual(track.genres, ["Electronic"]);
  assert.deepEqual(track.mood, ["energetic", "uplifting"]);
  assert.equal(track.audio_features.bpm, 118);
  assert.equal(track.audio_features.key, "C# minor");
});

test("mapTrackResource: title with version appended", () => {
  const resource = {
    id: "999",
    type: "tracks",
    attributes: {
      title: "Sapphire",
      version: "Extended Mix",
    },
  };

  const track = mapTrackResource(resource);
  assert.equal(track.title, "Sapphire (Extended Mix)");
});

test("mapTrackResource: no meta defaults to Unknown", () => {
  const resource = {
    id: "1",
    type: "tracks",
    attributes: { title: "Test" },
  };

  const track = mapTrackResource(resource);
  assert.equal(track.artist, "Unknown");
  assert.equal(track.album, "Unknown");
  assert.equal(track.release_year, null);
  assert.deepEqual(track.genres, []);
  assert.deepEqual(track.mood, []);
});

test("mapTrackResource: falls back to createdAt year when no releaseDate", () => {
  const resource = {
    id: "1",
    type: "tracks",
    attributes: {
      title: "Test",
      createdAt: "2023-06-15T10:30:00Z",
    },
  };
  const meta = {}; // no releaseDate

  const track = mapTrackResource(resource, meta);
  assert.equal(track.release_year, 2023);
});

test("mapTrackResource: releaseDate takes priority over createdAt", () => {
  const resource = {
    id: "1",
    type: "tracks",
    attributes: {
      title: "Test",
      createdAt: "2020-01-01T00:00:00Z",
    },
  };
  const meta = { releaseDate: "2019-06-01" };

  const track = mapTrackResource(resource, meta);
  assert.equal(track.release_year, 2019); // from meta, not 2020
});

test("mapTrackResource: no attributes defaults to Unknown title", () => {
  const resource = { id: "42", type: "tracks" };

  const track = mapTrackResource(resource);
  assert.equal(track.id, 42);
  assert.equal(track.title, "Unknown");
  assert.equal(track.duration, 0);
  assert.equal(track.audio_features.bpm, null);
  assert.equal(track.audio_features.key, null);
});

test("mapTrackResource: null bpm and key produce null audio_features", () => {
  const resource = {
    id: "1",
    type: "tracks",
    attributes: {
      title: "Ambient",
      bpm: null,
      key: null,
      keyScale: null,
    },
  };

  const track = mapTrackResource(resource);
  assert.equal(track.audio_features.bpm, null);
  assert.equal(track.audio_features.key, null);
});

test("mapTrackResource: integer id parsed from string", () => {
  const resource = { id: "00789", type: "tracks", attributes: { title: "X" } };
  const track = mapTrackResource(resource);
  assert.equal(track.id, 789);
  assert.equal(typeof track.id, "number");
});
