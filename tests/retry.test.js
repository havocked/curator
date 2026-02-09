const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { withRetry } = require("../dist/lib/retry");

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
});
