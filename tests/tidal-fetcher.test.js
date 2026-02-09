const test = require("node:test");
const assert = require("node:assert/strict");

const { delay } = require("../dist/services/tidal/fetcher");

// ─── delay ───────────────────────────────────────────────────────────────────

test("delay: resolves after specified time", async () => {
  const start = Date.now();
  await delay(50);
  const elapsed = Date.now() - start;
  // Should be at least 40ms (some tolerance for timer imprecision)
  assert.ok(elapsed >= 40, `Expected >= 40ms, got ${elapsed}ms`);
  // Should not take absurdly long
  assert.ok(elapsed < 200, `Expected < 200ms, got ${elapsed}ms`);
});

test("delay: zero ms resolves immediately", async () => {
  const start = Date.now();
  await delay(0);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 50, `Expected < 50ms, got ${elapsed}ms`);
});

// Note: fetchTracksByIds requires a live API client, so it's tested
// via integration tests. The order-preserving logic is implicitly tested
// through the mapper tests + the function's contract.
