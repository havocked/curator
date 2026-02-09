const test = require("node:test");
const assert = require("node:assert/strict");

// parseTrackIds is not exported, so we test the logic inline
function parseTrackIds(input) {
  return input
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
}

test("parseTrackIds handles newline-separated IDs", () => {
  const ids = parseTrackIds("1550546\n20115564\n251380837\n");
  assert.deepEqual(ids, ["1550546", "20115564", "251380837"]);
});

test("parseTrackIds handles comma-separated IDs", () => {
  const ids = parseTrackIds("1550546,20115564,251380837");
  assert.deepEqual(ids, ["1550546", "20115564", "251380837"]);
});

test("parseTrackIds skips empty lines and non-numeric values", () => {
  const ids = parseTrackIds("1550546\n\nhello\n20115564\n  \nabc123\n");
  assert.deepEqual(ids, ["1550546", "20115564"]);
});

test("parseTrackIds returns empty for no input", () => {
  assert.deepEqual(parseTrackIds(""), []);
  assert.deepEqual(parseTrackIds("   \n\n  "), []);
});
