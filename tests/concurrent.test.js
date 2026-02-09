const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runConcurrent } = require("../dist/lib/concurrent");

describe("runConcurrent", () => {
  it("returns results in original order", async () => {
    const tasks = [
      async () => {
        await new Promise((r) => setTimeout(r, 30));
        return "slow";
      },
      async () => "fast",
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "medium";
      },
    ];
    const results = await runConcurrent(tasks, 3);
    assert.deepEqual(results, ["slow", "fast", "medium"]);
  });

  it("respects concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 6 }, () => async () => {
      active++;
      if (active > maxActive) maxActive = active;
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return true;
    });

    await runConcurrent(tasks, 2);
    assert.equal(maxActive, 2);
  });

  it("handles failures gracefully", async () => {
    const tasks = [
      async () => "ok",
      async () => {
        throw new Error("fail");
      },
      async () => "also ok",
    ];
    const results = await runConcurrent(tasks, 2);
    assert.equal(results[0], "ok");
    assert.equal(results[1], undefined);
    assert.equal(results[2], "also ok");
  });

  it("handles empty task list", async () => {
    const results = await runConcurrent([], 3);
    assert.deepEqual(results, []);
  });
});
