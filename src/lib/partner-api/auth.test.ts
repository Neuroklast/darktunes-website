import { describe, it, expect, vi } from 'vitest'
import { ApiError } from '@/lib/errors'
import {
  authenticatePartnerApiKey,
  generatePartnerApiKey,
  hashPartnerApiKey,
  extractPartnerApiKey,
  PARTNER_API_KEY_PREFIX,
} from './auth'

describe('partner API auth helpers', () => {
  it('generates keys with expected prefix', () => {
    const { rawKey, prefix, hash } = generatePartnerApiKey()
    expect(rawKey.startsWith(PARTNER_API_KEY_PREFIX)).toBe(true)
    expect(prefix).toBe(rawKey.slice(0, 16))
    expect(hash).toBe(hashPartnerApiKey(rawKey))
  })

  it('hashes consistently', () => {
    const key = `${PARTNER_API_KEY_PREFIX}abc123`
    expect(hashPartnerApiKey(key)).toBe(hashPartnerApiKey(key))
  })

  it('extracts bearer token', () => {
    expect(extractPartnerApiKey('Bearer dt_live_abc')).toBe('dt_live_abc')
    expect(extractPartnerApiKey(null)).toBeNull()
  })

  it('authenticatePartnerApiKey rejects missing keys', async () => {
    const db = { from: vi.fn() } as never
    await expect(authenticatePartnerApiKey(db, null)).rejects.toMatchObject({
      status: 401,
      code: 'PARTNER_API_KEY_INVALID',
    })
  })

  it('authenticatePartnerApiKey rejects revoked keys', async () => {
    const key = generatePartnerApiKey()
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'k1', organization_id: 'org', scopes: ['read'], revoked_at: '2026-01-01' },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    }
    const db = { from: vi.fn().mockReturnValue(builder) } as never
    await expect(
      authenticatePartnerApiKey(db, `Bearer ${key.rawKey}`),
    ).rejects.toBeInstanceOf(ApiError)
  })
})