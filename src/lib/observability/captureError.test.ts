import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockWriteAppLog } = vi.hoisted(() => ({
  mockWriteAppLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/appLog', () => ({ writeAppLog: mockWriteAppLog }))

import { captureError, normalizeError } from './captureError'

describe('normalizeError', () => {
  it('handles Error instances with a digest', () => {
    const error = new Error('boom') as Error & { digest?: string }
    error.digest = 'abc'
    expect(normalizeError(error)).toMatchObject({
      errorName: 'Error',
      message: 'boom',
      digest: 'abc',
    })
  })

  it('handles plain objects', () => {
    expect(normalizeError({ name: 'ApiError', message: 'nope' })).toMatchObject({
      errorName: 'ApiError',
      message: 'nope',
    })
  })

  it('handles unknown values', () => {
    expect(normalizeError(undefined).message).toBe('Unknown error')
  })
})

describe('captureError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('APP_ERROR_LOG_TEST_PERSIST', 'true')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('persists an aggregated row with a fingerprint', async () => {
    await captureError('request.error', new Error('boom'), {
      source: 'server',
      path: '/api/x',
      method: 'GET',
    })

    expect(mockWriteAppLog).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        level: 'error',
        fingerprint: expect.stringMatching(/^fp_/),
        routePath: '/api/x',
        method: 'GET',
      }),
    )
  })

  it('never throws when persistence fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockWriteAppLog.mockRejectedValueOnce(new Error('db down'))
    await expect(captureError('request.error', new Error('boom'))).resolves.toBeUndefined()
    consoleSpy.mockRestore()
  })
})
