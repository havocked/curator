const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createGetSongBPMClient } = require("../dist/providers/getsongbpm");

describe("createGetSongBPMClient", () => {
  function mockClient(responses) {
    let callIndex = 0;
    return createGetSongBPMClient({
      apiKey: "test-key",
      rateLimitMs: 0,
      fetchFn: async (url) => {
        const resp = responses[callIndex++];
        if (!resp) throw new Error("Unexpected fetch call: " + url);
        return {
          ok: resp.ok ?? true,
          status: resp.status ?? 200,
          json: async () => resp.body,
        };
      },
    });
  }

  it("searchSong returns best match", async () => {
    const client = mockClient([
      {
        body: {
          search: [
            {
              id: "abc123",
              title: "Get Lucky",
              artist: { name: "Daft Punk" },
            },
          ],
        },
      },
    ]);

    const result = await client.searchSong("Daft Punk", "Get Lucky");
    assert.deepEqual(result, {
      songId: "abc123",
      title: "Get Lucky",
      artist: "Daft Punk",
    });
  });

  it("searchSong returns null when no results", async () => {
    const client = mockClient([{ body: { search: [] } }]);
    const result = await client.searchSong("Fake Artist", "Fake Song");
    assert.equal(result, null);
  });

  it("searchSong handles missing search array", async () => {
    const client = mockClient([{ body: {} }]);
    const result = await client.searchSong("Fake Artist", "Fake Song");
    assert.equal(result, null);
  });

  it("getSongDetails returns BPM, key, and time sig", async () => {
    const client = mockClient([
      {
        body: {
          song: {
            tempo: "116",
            key_of: "F# minor",
            time_sig: "4/4",
          },
        },
      },
    ]);

    const result = await client.getSongDetails("abc123");
    assert.deepEqual(result, {
      bpm: 116,
      key: "F# minor",
      timeSignature: "4/4",
    });
  });

  it("getSongDetails handles missing song", async () => {
    const client = mockClient([{ body: {} }]);
    const result = await client.getSongDetails("bad-id");
    assert.deepEqual(result, { bpm: null, key: null, timeSignature: null });
  });

  it("getSongDetails handles non-numeric tempo", async () => {
    const client = mockClient([
      {
        body: {
          song: {
            tempo: "not-a-number",
            key_of: "C major",
            time_sig: "4/4",
          },
        },
      },
    ]);

    const result = await client.getSongDetails("abc123");
    assert.equal(result.bpm, null);
    assert.equal(result.key, "C major");
  });

  it("getSongDetails handles empty string tempo", async () => {
    const client = mockClient([
      {
        body: {
          song: {
            tempo: "",
            key_of: "",
            time_sig: "",
          },
        },
      },
    ]);

    const result = await client.getSongDetails("abc123");
    assert.deepEqual(result, { bpm: null, key: null, timeSignature: null });
  });

  it("lookupTrack chains search + details", async () => {
    const client = mockClient([
      // Search call
      {
        body: {
          search: [
            {
              id: "xyz789",
              title: "Master of Puppets",
              artist: { name: "Metallica" },
            },
          ],
        },
      },
      // Song details call
      {
        body: {
          song: {
            tempo: "220",
            key_of: "Em",
            time_sig: "4/4",
          },
        },
      },
    ]);

    const result = await client.lookupTrack("Metallica", "Master of Puppets");
    assert.deepEqual(result, {
      bpm: 220,
      key: "Em",
      timeSignature: "4/4",
    });
  });

  it("lookupTrack returns nulls when search finds nothing", async () => {
    const client = mockClient([{ body: { search: [] } }]);
    const result = await client.lookupTrack("Unknown", "Unknown");
    assert.deepEqual(result, { bpm: null, key: null, timeSignature: null });
  });

  it("throws on API error", async () => {
    const client = mockClient([{ ok: false, status: 401, body: {} }]);
    await assert.rejects(
      () => client.searchSong("Test", "Test"),
      /GetSongBPM API 401/
    );
  });

  it("throws on network error", async () => {
    const client = createGetSongBPMClient({
      apiKey: "test-key",
      rateLimitMs: 0,
      fetchFn: async () => {
        throw new Error("fetch failed");
      },
    });

    await assert.rejects(
      () => client.searchSong("Test", "Test"),
      /GetSongBPM network error: fetch failed/
    );
  });

  it("passes api_key in query params", async () => {
    let capturedUrl = "";
    const client = createGetSongBPMClient({
      apiKey: "my-secret-key",
      rateLimitMs: 0,
      fetchFn: async (url) => {
        capturedUrl = url;
        return { ok: true, status: 200, json: async () => ({ search: [] }) };
      },
    });

    await client.searchSong("Test", "Test");
    assert.ok(capturedUrl.includes("api_key=my-secret-key"));
  });

  it("respects rate limiting", async () => {
    let calls = 0;
    const client = createGetSongBPMClient({
      apiKey: "test",
      rateLimitMs: 50,
      fetchFn: async () => {
        calls++;
        return { ok: true, status: 200, json: async () => ({ search: [] }) };
      },
    });

    const start = Date.now();
    await client.searchSong("A", "A");
    await client.searchSong("B", "B");
    const elapsed = Date.now() - start;

    assert.equal(calls, 2);
    assert.ok(elapsed >= 40, `Expected >=40ms, got ${elapsed}ms`);
  });
});
