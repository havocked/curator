const { describe, it } = require("node:test");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createMusicBrainzClient } = require("../dist/providers/musicbrainz");

test("searchLabel returns first label", async () => {
  const client = createMusicBrainzClient({
    rateLimitMs: 0,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        labels: [
          {
            id: "mbid-1",
            name: "Ed Banger Records",
            country: "FR",
            "life-span": { begin: "2003" },
          },
        ],
      }),
    }),
  });

  const label = await client.searchLabel("ed banger");
  assert.equal(label.mbid, "mbid-1");
  assert.equal(label.name, "Ed Banger Records");
  assert.equal(label.country, "FR");
  assert.equal(label.founded, "2003");
});

test("getLabelArtists extracts recording contract artists", async () => {
  const client = createMusicBrainzClient({
    rateLimitMs: 0,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        relations: [
          { type: "recording contract", artist: { name: "Justice" } },
          { type: "other", artist: { name: "Ignore" } },
        ],
      }),
    }),
  });

  const artists = await client.getLabelArtists("mbid-1");
  assert.deepEqual(artists, ["Justice"]);
});

test("searchArtist returns top match with score", async () => {
  const client = createMusicBrainzClient({
    rateLimitMs: 0,
    fetchFn: async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({
        artists: [
          { id: "mbid-dp", name: "Daft Punk", score: 100, disambiguation: "French electronic duo" },
          { id: "mbid-other", name: "Daft Punk Tribute", score: 60 },
        ],
      }),
    }),
  });

  const result = await client.searchArtist("Daft Punk");
  assert.equal(result.mbid, "mbid-dp");
  assert.equal(result.name, "Daft Punk");
  assert.equal(result.score, 100);
  assert.equal(result.disambiguation, "French electronic duo");
});

test("searchArtist returns null when no results", async () => {
  const client = createMusicBrainzClient({
    rateLimitMs: 0,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ artists: [] }),
    }),
  });

  const result = await client.searchArtist("Nonexistent Artist");
  assert.equal(result, null);
});

test("searchArtist quotes name to handle special chars", async () => {
  let capturedUrl = "";
  const client = createMusicBrainzClient({
    rateLimitMs: 0,
    fetchFn: async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ artists: [{ id: "mbid-fdc", name: "Fontaines D.C.", score: 100 }] }),
      };
    },
  });

  await client.searchArtist("Fontaines D.C.");
  // Should contain quoted artist name
  assert.ok(capturedUrl.includes(encodeURIComponent('"Fontaines D.C."')));
});

test("getArtistGenres returns sorted genres", async () => {
  const client = createMusicBrainzClient({
    rateLimitMs: 0,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "mbid-dp",
        genres: [
          { name: "disco", count: 3 },
          { name: "electronic", count: 34 },
          { name: "house", count: 15 },
        ],
      }),
    }),
  });

  const result = await client.getArtistGenres("mbid-dp");
  assert.equal(result.mbid, "mbid-dp");
  // Should be sorted by vote count descending
  assert.deepEqual(result.genres, ["electronic", "house", "disco"]);
  assert.deepEqual(result.votes, [34, 15, 3]);
});

test("getArtistGenres handles empty genres", async () => {
  const client = createMusicBrainzClient({
    rateLimitMs: 0,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "mbid-x", genres: [] }),
    }),
  });

  const result = await client.getArtistGenres("mbid-x");
  assert.deepEqual(result.genres, []);
  assert.deepEqual(result.votes, []);
});
