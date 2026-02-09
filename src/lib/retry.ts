const DEFAULT_RETRY_DELAY_MS = 4000;
const DEFAULT_MAX_RETRIES = 3;

type RetryOptions = {
  maxRetries?: number;
  label?: string;
};

/**
 * Wraps an async function with retry logic for HTTP 429 rate limits.
 * Reads Retry-After header to determine wait time.
 * Only retries on 429 — all other errors are thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<{ data?: T; error?: unknown; response?: Response }>,
  options?: RetryOptions
): Promise<{ data?: T; error?: unknown; response?: Response }> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const label = options?.label ?? "request";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();
    const status = result.response?.status;

    if (status !== 429) return result;

    if (attempt === maxRetries) {
      console.error(`[retry] ${label} — 429 after ${maxRetries} retries, giving up`);
      return result;
    }

    const retryAfter = result.response?.headers?.get("retry-after");
    const delayMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : DEFAULT_RETRY_DELAY_MS;

    console.error(
      `[retry] ${label} — 429, waiting ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Retry loop exited unexpectedly");
}
