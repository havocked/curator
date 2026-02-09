const test = require("node:test");
const assert = require("node:assert/strict");

const { filterTracks } = require("../dist/commands/filter");

test("filterTracks keeps familiar favorites", () => {
  const payload = {
    tracks: [{ id: 1, title: "One" }, { id: 2, title: "Two" }, { id: 3, title: "Three" }],
  };
  const result = filterTracks(payload, new Set([1, 3]), "familiar");

  assert.equal(result.count, 2);
  assert.equal(result.tracks[0].id, 1);
  assert.equal(result.tracks[1].id, 3);
});

test("filterTracks keeps discovery tracks with limit", () => {
  const payload = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const result = filterTracks(payload, new Set([1, 3]), "discovery", 1);

  assert.equal(result.count, 1);
  assert.equal(result.tracks[0].id, 2);
});
