/**
 * Per-API retry policies for external sync calls.
 * Classifies errors and applies backoff with jitter for transient failures.
 */

import { HttpError } from '@/lib/rateLimiter'

export type SyncApiName = 'itunes' | 'spotify' | 'discogs' | 'songkick' | 'bandsintown'

export type SyncErrorClass = 'permanent' | 'transient' | 'rate_limited'

export interface ApiRetryProfile {
  maxRetries: number
  baseDelayMs: number
  jitter: boolean
}

export const API_RETRY_PROFILES: Record<SyncApiName, ApiRetryProfile> = {
  itunes: { maxRetries: 3, baseDelayMs: 500, jitter: false },
  spotify: { maxRetries: 4, baseDelayMs: 1000, jitter: true },
  discogs: { maxRetries: 3, baseDelayMs: 1000, jitter: true },
  songkick: { maxRetries: 3, baseDelayMs: 1000, jitter: true },
  bandsintown: { maxRetries: 3, baseDelayMs: 1000, jitter: true },
}

/** Cooldown before re-queueing a job that hit rate limits (ms). */
export const RATE_LIMIT_JOB_COOLDOWN_MS = 15 * 60 * 1000

/** Network / DNS failures that should be retried (e.g. R2 getaddrinfo EBUSY). */
export function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  return (
    msg.includes('getaddrinfo') ||
    msg.includes('EBUSY') ||
    msg.includes('EAI_AGAIN') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('EPIPE') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('UND_ERR')
  )
}

export function classifySyncError(err: unknown): SyncErrorClass {
  if (err instanceof HttpError) {
    if (err.status === 429) return 'rate_limited'
    if (err.status >= 500) return 'transient'
    if (err.status === 404 || err.status === 405 || err.status === 422) return 'permanent'
    if (err.status >= 400) return 'permanent'
    return 'transient'
  }

  const msg = String(err)
  if (msg.includes('429') || msg.includes('TOO_MANY_REQUESTS')) return 'rate_limited'
  if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return 'transient'
  if (isTransientNetworkError(err)) return 'transient'
  // Deprecation failures never recover by retrying. HTTP status
  // errors are already classified as permanent via the HttpError branch above.
  if (msg.includes('PUBLIC_API_ACCESS_DEPRECATED')) return 'permanent'
  if (
    msg.includes('404') ||
    msg.includes('405') ||
    msg.includes('422') ||
    msg.includes('UNSUPPORTED_URL') ||
    msg.includes('No match')
  ) {
    return 'permanent'
  }
  if (msg.includes('no unique or exclusion constraint')) return 'permanent'
  return 'transient'
}

export function isPermanentSyncError(err: unknown): boolean {
  return classifySyncError(err) === 'permanent'
}

export function isRateLimitedSyncError(err: unknown): boolean {
  return classifySyncError(err) === 'rate_limited'
}

function applyJitter(delayMs: number): number {
  const factor = 0.75 + Math.random() * 0.5
  return Math.round(delayMs * factor)
}

function delayWithProfile(baseDelayMs: number, attempt: number, jitter: boolean): number {
  const exponential = baseDelayMs * Math.pow(2, attempt)
  return jitter ? applyJitter(exponential) : exponential
}

/**
 * Executes `fn` with API-specific retry policy.
 * Permanent and rate-limited errors throw immediately (rate limits are handled
 * by the queue via cooldown reschedule — retrying them burns the time budget).
 * Transient errors retry with exponential backoff.
 */
export async function withApiRetry<T>(api: SyncApiName, fn: () => Promise<T>): Promise<T> {
  const profile = API_RETRY_PROFILES[api]
  let lastErr: unknown

  for (let attempt = 0; attempt <= profile.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const errorClass = classifySyncError(err)
      if (
        errorClass === 'permanent' ||
        errorClass === 'rate_limited' ||
        attempt === profile.maxRetries
      ) {
        throw err
      }
      const delay = delayWithProfile(profile.baseDelayMs, attempt, profile.jitter)
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastErr
}

const TRANSIENT_IO_MAX_RETRIES = 3
const TRANSIENT_IO_BASE_DELAY_MS = 400

/**
 * Retries transient network/DNS errors (e.g. R2 `getaddrinfo EBUSY`).
 * Permanent failures throw on the first attempt.
 */
export async function withTransientIoRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown

  for (let attempt = 0; attempt <= TRANSIENT_IO_MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientNetworkError(err) || attempt === TRANSIENT_IO_MAX_RETRIES) {
        throw err
      }
      const delay = delayWithProfile(TRANSIENT_IO_BASE_DELAY_MS, attempt, true)
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastErr
}

