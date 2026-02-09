const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createEnrichmentCache, CACHE_TTL } = require("../dist/enrichment/cache");

function makeDb() {
  return new Database(":memory:");
}

describe("EnrichmentCache", () => {
  let db;
  let cache;

  beforeEach(() => {
    db = makeDb();
    cache = createEnrichmentCache(db);
  });

  it("returns null for unknown artist (cache miss)", () => {
    assert.equal(cache.getArtist("Unknown Artist"), null);
  });

  it("stores and retrieves artist genres", () => {
    cache.setArtist("Daft Punk", {
      mbid: "mbid-dp",
      genres: ["electronic", "house", "french house"],
      votes: [34, 15, 12],
    });

    const result = cache.getArtist("Daft Punk");
    assert.deepEqual(result, {
      mbid: "mbid-dp",
      genres: ["electronic", "house", "french house"],
      votes: [34, 15, 12],
    });
  });

  it("stores and retrieves 'not found' results", () => {
    cache.setArtistNotFound("Fake Artist");
    assert.equal(cache.getArtist("Fake Artist"), "not_found");
  });

  it("upserts on duplicate artist name", () => {
    cache.setArtist("Bonobo", {
      mbid: "mbid-v1",
      genres: ["electronic"],
      votes: [5],
    });
    cache.setArtist("Bonobo", {
      mbid: "mbid-v1",
      genres: ["electronic", "downtempo", "trip hop"],
      votes: [5, 3, 2],
    });

    const result = cache.getArtist("Bonobo");
    assert.equal(result.genres.length, 3);
  });

  it("reports stats correctly", () => {
    cache.setArtist("A", { mbid: "1", genres: ["rock"], votes: [1] });
    cache.setArtist("B", { mbid: "2", genres: ["pop"], votes: [1] });
    cache.setArtistNotFound("C");

    const stats = cache.stats();
    assert.equal(stats.total, 3);
    assert.equal(stats.found, 2);
    assert.equal(stats.notFound, 1);
  });

  it("expires 'not found' entries after NOT_FOUND_DAYS", () => {
    // Manually insert an expired "not found" entry
    const expired = new Date();
    expired.setDate(expired.getDate() - CACHE_TTL.NOT_FOUND_DAYS - 1);

    db.prepare(
      `INSERT INTO enrichment_artists (artist_name, mbid, genres_json, votes_json, found, fetched_at)
       VALUES (?, NULL, NULL, NULL, 0, ?)`
    ).run("Old Miss", expired.toISOString());

    // Should return null (expired), not "not_found"
    assert.equal(cache.getArtist("Old Miss"), null);
  });

  it("expires found entries after FOUND_DAYS", () => {
    const expired = new Date();
    expired.setDate(expired.getDate() - CACHE_TTL.FOUND_DAYS - 1);

    db.prepare(
      `INSERT INTO enrichment_artists (artist_name, mbid, genres_json, votes_json, found, fetched_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    ).run("Old Hit", "mbid-old", '["rock"]', '[10]', expired.toISOString());

    // Should return null (expired)
    assert.equal(cache.getArtist("Old Hit"), null);
  });

  it("keeps found entries within FOUND_DAYS", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 5); // 5 days ago, well within 30-day TTL

    db.prepare(
      `INSERT INTO enrichment_artists (artist_name, mbid, genres_json, votes_json, found, fetched_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    ).run("Recent Hit", "mbid-r", '["jazz"]', '[3]', recent.toISOString());

    const result = cache.getArtist("Recent Hit");
    assert.deepEqual(result, { mbid: "mbid-r", genres: ["jazz"], votes: [3] });
  });

  it("schema is idempotent (safe to call twice)", () => {
    // Creating a second cache on the same DB should not throw
    const cache2 = createEnrichmentCache(db);
    cache.setArtist("Test", { mbid: "1", genres: [], votes: [] });
    assert.ok(cache2.getArtist("Test") !== null);
  });
});
