const test = require("node:test");
const assert = require("node:assert/strict");

const { arrangeTracks } = require("../dist/commands/arrange");

test("arrangeTracks keeps order by default", () => {
  const payload = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const result = arrangeTracks(payload, {});
  assert.deepEqual(
    result.tracks.map((track) => track.id),
    [1, 2, 3]
  );
});

test("arrangeTracks sorts by tempo", () => {
  const payload = {
    tracks: [
      { id: 1, bpm: 120 },
      { id: 2, bpm: 90 },
      { id: 3, bpm: 110 },
    ],
  };
  const result = arrangeTracks(payload, { by: "tempo" });
  assert.deepEqual(
    result.tracks.map((track) => track.id),
    [2, 3, 1]
  );
});

test("arrangeTracks sorts by key", () => {
  const payload = {
    tracks: [
      { id: 1, key: "C major" },
      { id: 2, key: "A minor" },
      { id: 3, key: "D major" },
    ],
  };
  const result = arrangeTracks(payload, { by: "key" });
  assert.deepEqual(
    result.tracks.map((track) => track.id),
    [2, 1, 3]
  );
});

test("arrangeTracks leaves missing tempo at end", () => {
  const payload = {
    tracks: [
      { id: 1, bpm: 100 },
      { id: 2 },
      { id: 3, bpm: 90 },
      { id: 4 },
    ],
  };
  const result = arrangeTracks(payload, { by: "tempo" });
  assert.deepEqual(
    result.tracks.map((track) => track.id),
    [3, 1, 2, 4]
  );
});

test("arrangeTracks gentle_rise starts low and peaks mid", () => {
  const payload = {
    tracks: [
      { id: 1, bpm: 70 },
      { id: 2, bpm: 80 },
      { id: 3, bpm: 85 },
      { id: 4, bpm: 88 },
      { id: 5, bpm: 92 },
      { id: 6, bpm: 98 },
      { id: 7, bpm: 105 },
      { id: 8, bpm: 112 },
      { id: 9, bpm: 120 },
      { id: 10, bpm: 125 },
      { id: 11, bpm: 130 },
      { id: 12, bpm: 135 },
    ],
  };

  const result = arrangeTracks(payload, { arc: "gentle_rise" });
  const bpms = result.tracks.map((track) => track.bpm);
  assert.ok(bpms[0] <= 90);
  assert.ok(bpms[bpms.length - 1] <= 90);

  const maxBpm = Math.max(...bpms);
  const maxIndex = bpms.indexOf(maxBpm);
  const lowerBound = Math.floor(bpms.length * 0.25);
  const upperBound = Math.floor(bpms.length * 0.75);
  assert.ok(maxIndex >= lowerBound && maxIndex <= upperBound);
});

test("arrangeTracks gentle_rise appends missing bpm tracks", () => {
  const payload = {
    tracks: [
      { id: 1, bpm: 80 },
      { id: 2 },
      { id: 3, bpm: 120 },
      { id: 4 },
    ],
  };

  const result = arrangeTracks(payload, { arc: "gentle_rise" });
  const ids = result.tracks.map((track) => track.id);
  assert.deepEqual(ids.slice(-2), [2, 4]);
});
