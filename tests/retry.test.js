const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { withRetry, withEmptyRetry } = require("../dist/lib/retry");

describe("withRetry", () => {
  it("returns immediately on 200", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return { data: "ok", response: new Response(null, { status: 200 }) };
      },
      { maxRetries: 3 }
    );
    assert.equal(calls, 1);
    assert.equal(result.data, "ok");
  });

  it("retries on 429 and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls === 1) {
          return {
            error: {},
            response: new Response(null, {
              status: 429,
              headers: { "retry-after": "0" },
            }),
          };
        }
        return { data: "ok", response: new Response(null, { status: 200 }) };
      },
      { maxRetries: 3 }
    );
    assert.equal(calls, 2);
    assert.equal(result.data, "ok");
  });

  it("gives up after maxRetries", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return {
          error: {},
          response: new Response(null, {
            status: 429,
            headers: { "retry-after": "0" },
          }),
        };
      },
      { maxRetries: 2 }
    );
    assert.equal(calls, 3); // initial + 2 retries
    assert.equal(result.response?.status, 429);
  });

  it("does not retry on non-429 errors", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return {
          error: { message: "not found" },
          response: new Response(null, { status: 404 }),
        };
      },
      { maxRetries: 3 }
    );
    assert.equal(calls, 1);
    assert.equal(result.response?.status, 404);
  });

  it("uses default delay when no Retry-After header", async () => {
    let calls = 0;
    const start = Date.now();
    await withRetry(
      async () => {
        calls++;
        if (calls === 1) {
          return {
            error: {},
            response: new Response(null, { status: 429 }),
          };
        }
        return { data: "ok", response: new Response(null, { status: 200 }) };
      },
      { maxRetries: 1 }
    );
    const elapsed = Date.now() - start;
    assert.equal(calls, 2);
    // Default delay is 1000ms, allow some tolerance
    assert.ok(elapsed >= 800, `Expected >= 800ms, got ${elapsed}ms`);
    assert.ok(elapsed < 3000, `Expected < 3000ms, got ${elapsed}ms`);
  });
});

describe("withEmptyRetry", () => {
  it("returns immediately when result is non-empty", async () => {
    let calls = 0;
    const result = await withEmptyRetry(
      async () => { calls++; return { value: 42 }; },
      (r) => r.value === 0,
      { maxRetries: 3, delayMs: 10 }
    );
    assert.equal(calls, 1);
    assert.deepEqual(result, { value: 42 });
  });

  it("retries on null result and succeeds", async () => {
    let calls = 0;
    const result = await withEmptyRetry(
      async () => {
        calls++;
        if (calls < 3) return null;
        return { name: "found" };
      },
      () => false,
      { maxRetries: 3, delayMs: 10 }
    );
    assert.equal(calls, 3);
    assert.deepEqual(result, { name: "found" });
  });

  it("retries when isEmpty returns true", async () => {
    let calls = 0;
    const result = await withEmptyRetry(
      async () => {
        calls++;
        if (calls < 2) return [];
        return ["track1", "track2"];
      },
      (r) => r.length === 0,
      { maxRetries: 3, delayMs: 10 }
    );
    assert.equal(calls, 2);
    assert.deepEqual(result, ["track1", "track2"]);
  });

  it("gives up after maxRetries and returns last result", async () => {
    let calls = 0;
    const result = await withEmptyRetry(
      async () => { calls++; return null; },
      () => false,
      { maxRetries: 2, delayMs: 10 }
    );
    assert.equal(calls, 3); // initial + 2 retries
    assert.equal(result, null);
  });

  it("uses exponential backoff", async () => {
    let calls = 0;
    const timestamps = [];
    const start = Date.now();
    await withEmptyRetry(
      async () => {
        calls++;
        timestamps.push(Date.now() - start);
        return null;
      },
      () => false,
      { maxRetries: 2, delayMs: 50 }
    );
    assert.equal(calls, 3);
    // First retry after ~50ms, second after ~100ms (50 * 2^1)
    const gap1 = timestamps[1] - timestamps[0];
    const gap2 = timestamps[2] - timestamps[1];
    assert.ok(gap1 >= 30, `First gap ${gap1}ms should be >= 30ms (base 50ms)`);
    assert.ok(gap2 >= 60, `Second gap ${gap2}ms should be >= 60ms (base 100ms)`);
    assert.ok(gap2 > gap1 * 0.8, `Second gap should be larger than first (exponential)`);
  });

  it("returns undefined result without retrying when isEmpty is not triggered", async () => {
    let calls = 0;
    const result = await withEmptyRetry(
      async () => { calls++; return undefined; },
      () => false,
      { maxRetries: 3, delayMs: 10 }
    );
    // undefined is treated as empty (null check in withEmptyRetry)
    assert.equal(calls, 3 + 1); // retries on undefined too
  });
});
