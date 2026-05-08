/**
 * Rate-limiting utilities for server-side external API calls.
 *
 * Provides an exponential-backoff retry wrapper that gracefully handles
 * HTTP 429 (Too Many Requests) and transient 5xx errors without crashing
 * the sync process.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (not counting the initial call). Default: 4 */
  maxRetries: number
  /** Initial delay before the first retry in milliseconds. Default: 500 */
  initialDelayMs: number
  /** Maximum delay cap in milliseconds. Default: 30,000 */
  maxDelayMs: number
  /** Multiplicative back-off factor. Default: 2 */
  factor: number
  /** HTTP status codes that should trigger a retry. Default: [429, 500, 502, 503, 504] */
  retryableStatuses: number[]
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 4,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  factor: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
}

/**
 * A marker class for HTTP errors so the retry logic can inspect status codes.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/**
 * Sleeps for the given number of milliseconds.
 * Exported for testability.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculates the next back-off delay with optional jitter.
 */
export function calcDelay(attempt: number, options: RetryOptions): number {
  const base = options.initialDelayMs * Math.pow(options.factor, attempt)
  // Add ±20 % jitter to spread retries across concurrent callers
  const jitter = base * 0.2 * (Math.random() * 2 - 1)
  return Math.min(Math.round(base + jitter), options.maxDelayMs)
}

/**
 * Wraps an async function with exponential-backoff retry logic.
 *
 * The wrapped function will be retried when it throws an `HttpError` whose
 * status code is in `retryableStatuses`, or when it throws any other
 * `Error` (treated as a transient failure).
 *
 * @param fn      - Async function to execute.
 * @param opts    - Partial overrides for retry parameters.
 * @param onRetry - Optional callback invoked before each retry (useful for logging).
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {},
  onRetry?: (attempt: number, error: Error, delayMs: number) => void,
): Promise<T> {
  const options: RetryOptions = { ...DEFAULT_OPTIONS, ...opts }
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      const isRetryable =
        err instanceof HttpError
          ? options.retryableStatuses.includes(err.status)
          : true

      if (!isRetryable || attempt >= options.maxRetries) {
        throw lastError
      }

      const delay = calcDelay(attempt, options)
      onRetry?.(attempt + 1, lastError, delay)
      await sleep(delay)
    }
  }

  throw lastError
}
