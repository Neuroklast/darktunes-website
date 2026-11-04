import { describe, it, expect, vi } from 'vitest'
import { HttpError } from '@/lib/rateLimiter'
import {
  classifySyncError,
  isRateLimitedSyncError,
  isPermanentSyncError,
  isTransientNetworkError,
  withApiRetry,
  withTransientIoRetry,
} from './retryPolicy'

describe('classifySyncError', () => {
  it('classifies 429 as rate_limited', () => {
    expect(classifySyncError(new HttpError(429, 'too many'))).toBe('rate_limited')
  })

  it('classifies 404 as permanent', () => {
    expect(classifySyncError(new HttpError(404, 'missing'))).toBe('permanent')
  })

  it('classifies 502 as transient', () => {
    expect(classifySyncError(new HttpError(502, 'bad gateway'))).toBe('transient')
  })

  it('classifies getaddrinfo EBUSY as transient', () => {
    expect(
      classifySyncError(new Error('getaddrinfo EBUSY darktunes-assets.r2.cloudflarestorage.com')),
    ).toBe('transient')
    expect(
      isTransientNetworkError(new Error('getaddrinfo EBUSY host')),
    ).toBe(true)
  })
})

describe('withApiRetry', () => {
  it('retries transient errors then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(502, 'bad gateway'))
      .mockResolvedValue('ok')

    const result = await withApiRetry('songkick', fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry permanent errors', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(404, 'missing'))
    await expect(withApiRetry('songkick', fn)).rejects.toThrow('missing')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not retry rate-limited errors (queue handles cooldown)', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(429, 'too many'))
    await expect(withApiRetry('songkick', fn)).rejects.toThrow('too many')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('withTransientIoRetry', () => {
  it('retries DNS EBUSY then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('getaddrinfo EBUSY r2.cloudflarestorage.com'))
      .mockResolvedValue('ok')

    await expect(withTransientIoRetry(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry permanent HTTP download failures', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failed to download image (404): x'))
    await expect(withTransientIoRetry(fn)).rejects.toThrow('404')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('helpers', () => {
  it('detects rate limited strings', () => {
    expect(isRateLimitedSyncError(new HttpError(429, 'x'))).toBe(true)
    expect(isPermanentSyncError(new HttpError(422, 'x'))).toBe(true)
  })
})