import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withExponentialBackoff, HttpError, calcDelay, sleep } from './rateLimiter'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Replace sleep with a no-op so tests don't actually wait */
vi.mock('./rateLimiter', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./rateLimiter')>()
  return {
    ...mod,
    sleep: vi.fn().mockResolvedValue(undefined),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ── calcDelay ────────────────────────────────────────────────────────────────

describe('calcDelay', () => {
  const opts = {
    maxRetries: 4,
    initialDelayMs: 1000,
    maxDelayMs: 30_000,
    factor: 2,
    retryableStatuses: [429, 500],
  }

  it('grows exponentially with each attempt', () => {
    const d0 = 1000 // attempt 0: 1000 * 2^0 = 1000 (base, before jitter)
    const d1Base = 2000 // attempt 1: 1000 * 2^1 = 2000

    // Due to jitter the exact value will vary; verify the range.
    const d0actual = calcDelay(0, opts)
    const d1actual = calcDelay(1, opts)

    expect(d0actual).toBeGreaterThanOrEqual(d0 * 0.8)
    expect(d0actual).toBeLessThanOrEqual(d0 * 1.2)
    expect(d1actual).toBeGreaterThanOrEqual(d1Base * 0.8)
    expect(d1actual).toBeLessThanOrEqual(d1Base * 1.2)
  })

  it('is capped at maxDelayMs', () => {
    // Very high attempt should hit the cap
    expect(calcDelay(100, opts)).toBeLessThanOrEqual(opts.maxDelayMs)
  })
})

// ── withExponentialBackoff ───────────────────────────────────────────────────

describe('withExponentialBackoff', () => {
  it('returns the result immediately when fn succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withExponentialBackoff(fn, { maxRetries: 3 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on generic Error and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('success')

    const result = await withExponentialBackoff(fn, { maxRetries: 3, initialDelayMs: 0 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after maxRetries is exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'))
    await expect(
      withExponentialBackoff(fn, { maxRetries: 2, initialDelayMs: 0 }),
    ).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it('retries on HttpError 429', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(429, 'Too Many Requests'))
      .mockResolvedValue('data')

    const result = await withExponentialBackoff(fn, {
      maxRetries: 2,
      initialDelayMs: 0,
      retryableStatuses: [429],
    })
    expect(result).toBe('data')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on non-retryable HttpError (e.g. 404)', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(404, 'Not Found'))
    await expect(
      withExponentialBackoff(fn, { maxRetries: 3, retryableStatuses: [429, 500] }),
    ).rejects.toThrow('Not Found')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls onRetry callback with attempt number and delay', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')
    const onRetry = vi.fn()

    await withExponentialBackoff(fn, { maxRetries: 2, initialDelayMs: 0 }, onRetry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0]).toBe(1) // attempt number
  })
})

// ── sleep ─────────────────────────────────────────────────────────────────────

describe('sleep (unit)', () => {
  it('resolves after the given delay (mocked)', async () => {
    // sleep is mocked to resolve immediately in this test suite
    await expect(sleep(100)).resolves.toBeUndefined()
  })
})
