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
