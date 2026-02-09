const test = require("node:test");
const assert = require("node:assert/strict");

const { extractTrackIds, formatTidalIds } = require("../dist/commands/export");

test("extractTrackIds handles tracks array with ids", () => {
  const payload = {
    tracks: [
      { id: 101, title: "One" },
      { tidal_id: 202, title: "Two" },
      { track_id: "303" },
    ],
  };
  assert.deepEqual(extractTrackIds(payload), [101, 202, 303]);
});

test("extractTrackIds handles array payload", () => {
  const payload = [1, "2", { id: 3 }];
  assert.deepEqual(extractTrackIds(payload), [1, 2, 3]);
});

test("formatTidalIds outputs newline separated ids", () => {
  assert.equal(formatTidalIds([11, 22, 33]), "11\n22\n33");
});
