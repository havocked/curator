/**
 * Run async tasks with a concurrency limit.
 * Returns results in original order. Failed tasks return undefined.
 */
export async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<(T | undefined)[]> {
  const results: (T | undefined)[] = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      const task = tasks[i];
      if (!task) break;
      try {
        results[i] = await task();
      } catch {
        results[i] = undefined;
      }
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
