import { log } from "./logger";

const DEFAULT_RETRY_DELAY_MS = 1000;
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
      log(`[retry] ${label} — 429 after ${maxRetries} retries, giving up`);
      return result;
    }

    const retryAfter = result.response?.headers?.get("retry-after");
    const delayMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : DEFAULT_RETRY_DELAY_MS;

    log(
      `[retry] ${label} — 429, waiting ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Retry loop exited unexpectedly");
}

type RetryEmptyOptions = {
  maxRetries?: number;
  label?: string;
  delayMs?: number;
};

/**
 * Retry a function that might return null/empty due to silent rate limiting.
 * Tidal sometimes returns empty results instead of 429 under load.
 * Uses exponential backoff: delayMs, delayMs*2, delayMs*4, ...
 */
export async function withEmptyRetry<T>(
  fn: () => Promise<T | null | undefined>,
  isEmpty: (result: T) => boolean,
  options?: RetryEmptyOptions
): Promise<T | null | undefined> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = options?.delayMs ?? 500;
  const label = options?.label ?? "request";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();

    // Got a real result
    if (result != null && !isEmpty(result)) return result;

    // Last attempt — return whatever we got
    if (attempt === maxRetries) {
      log(`[retry] ${label} — empty after ${maxRetries} retries, giving up`);
      return result;
    }

    const delayMs = baseDelay * Math.pow(2, attempt);
    log(
      `[retry] ${label} — empty result, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}
