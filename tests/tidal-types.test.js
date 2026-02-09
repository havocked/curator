const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COUNTRY_CODE,
  RATE_LIMIT_MS,
  BATCH_SIZE,
} = require("../dist/services/tidal/types");

// ─── Constants ───────────────────────────────────────────────────────────────

test("COUNTRY_CODE is DE", () => {
  assert.equal(COUNTRY_CODE, "DE");
});

test("RATE_LIMIT_MS is a positive number", () => {
  assert.equal(typeof RATE_LIMIT_MS, "number");
  assert.ok(RATE_LIMIT_MS > 0, "Rate limit should be positive");
  assert.ok(RATE_LIMIT_MS <= 1000, "Rate limit should be reasonable (<=1s)");
});

test("BATCH_SIZE is a positive number within API limits", () => {
  assert.equal(typeof BATCH_SIZE, "number");
  assert.ok(BATCH_SIZE > 0, "Batch size should be positive");
  assert.ok(BATCH_SIZE <= 100, "Batch size should respect URL length limits");
});
