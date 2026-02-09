const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createEnrichmentCache, CACHE_TTL } = require("../dist/enrichment/cache");

function makeDb() {
  return new Database(":memory:");
}

describe("BPM Cache", () => {
  let db;
  let cache;

  beforeEach(() => {
    db = makeDb();
    cache = createEnrichmentCache(db);
  });

  it("returns null for unknown track (cache miss)", () => {
    assert.equal(cache.getBPM(999999), null);
  });

  it("stores and retrieves BPM data", () => {
    cache.setBPM(12345, "Daft Punk", "Get Lucky", {
      bpm: 116,
      key: "F# minor",
      timeSignature: "4/4",
    });

    const result = cache.getBPM(12345);
    assert.deepEqual(result, {
      bpm: 116,
      key: "F# minor",
      timeSignature: "4/4",
    });
  });

  it("stores and retrieves 'not found' results", () => {
    cache.setBPMNotFound(99999, "Unknown Artist", "Unknown Track");
    assert.equal(cache.getBPM(99999), "not_found");
  });

  it("handles null BPM with non-null key", () => {
    cache.setBPM(11111, "Artist", "Track", {
      bpm: null,
      key: "C major",
      timeSignature: "4/4",
    });

    const result = cache.getBPM(11111);
    assert.equal(result.bpm, null);
    assert.equal(result.key, "C major");
  });

  it("handles null key with non-null BPM", () => {
    cache.setBPM(22222, "Artist", "Track", {
      bpm: 120,
      key: null,
      timeSignature: null,
    });

    const result = cache.getBPM(22222);
    assert.equal(result.bpm, 120);
    assert.equal(result.key, null);
  });

  it("upserts on duplicate track id", () => {
    cache.setBPM(33333, "Artist", "Track", {
      bpm: 100,
      key: "Am",
      timeSignature: "4/4",
    });
    cache.setBPM(33333, "Artist", "Track", {
      bpm: 120,
      key: "Cm",
      timeSignature: "3/4",
    });

    const result = cache.getBPM(33333);
    assert.equal(result.bpm, 120);
    assert.equal(result.key, "Cm");
    assert.equal(result.timeSignature, "3/4");
  });

  it("reports bpmStats correctly", () => {
    cache.setBPM(1, "A", "T1", { bpm: 120, key: "C", timeSignature: "4/4" });
    cache.setBPM(2, "B", "T2", { bpm: 140, key: "D", timeSignature: "4/4" });
    cache.setBPMNotFound(3, "C", "T3");

    const stats = cache.bpmStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.found, 2);
    assert.equal(stats.notFound, 1);
  });

  it("expires 'not found' BPM entries after NOT_FOUND_DAYS", () => {
    const expired = new Date();
    expired.setDate(expired.getDate() - CACHE_TTL.NOT_FOUND_DAYS - 1);

    db.prepare(
      `INSERT INTO enrichment_bpm (track_id, artist, title, bpm, key, time_sig, found, fetched_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, 0, ?)`
    ).run(44444, "Old", "Miss", expired.toISOString());

    assert.equal(cache.getBPM(44444), null); // Expired → cache miss
  });

  it("expires found BPM entries after FOUND_DAYS", () => {
    const expired = new Date();
    expired.setDate(expired.getDate() - CACHE_TTL.FOUND_DAYS - 1);

    db.prepare(
      `INSERT INTO enrichment_bpm (track_id, artist, title, bpm, key, time_sig, found, fetched_at)
       VALUES (?, ?, ?, 120, 'Am', '4/4', 1, ?)`
    ).run(55555, "Old", "Hit", expired.toISOString());

    assert.equal(cache.getBPM(55555), null); // Expired
  });

  it("keeps found BPM entries within FOUND_DAYS", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 5);

    db.prepare(
      `INSERT INTO enrichment_bpm (track_id, artist, title, bpm, key, time_sig, found, fetched_at)
       VALUES (?, ?, ?, 128, 'Gm', '4/4', 1, ?)`
    ).run(66666, "Recent", "Hit", recent.toISOString());

    const result = cache.getBPM(66666);
    assert.deepEqual(result, { bpm: 128, key: "Gm", timeSignature: "4/4" });
  });

  it("BPM schema is idempotent (safe to call twice)", () => {
    const cache2 = createEnrichmentCache(db);
    cache.setBPM(1, "A", "T", { bpm: 120, key: "C", timeSignature: "4/4" });
    const result = cache2.getBPM(1);
    assert.ok(result !== null && result !== "not_found");
    assert.equal(result.bpm, 120);
  });

  it("artist cache and BPM cache coexist", () => {
    // Store artist data
    cache.setArtist("Daft Punk", {
      mbid: "mbid-dp",
      genres: ["electronic"],
      votes: [34],
    });

    // Store BPM data
    cache.setBPM(12345, "Daft Punk", "Get Lucky", {
      bpm: 116,
      key: "F#m",
      timeSignature: "4/4",
    });

    // Both should be retrievable
    const artist = cache.getArtist("Daft Punk");
    assert.ok(artist !== null && artist !== "not_found");
    assert.equal(artist.genres[0], "electronic");

    const bpm = cache.getBPM(12345);
    assert.ok(bpm !== null && bpm !== "not_found");
    assert.equal(bpm.bpm, 116);

    // Stats should be independent
    const aStats = cache.stats();
    const bStats = cache.bpmStats();
    assert.equal(aStats.found, 1);
    assert.equal(bStats.found, 1);
  });
});
