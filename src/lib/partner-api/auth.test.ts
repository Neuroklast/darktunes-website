import { describe, it, expect } from 'vitest'
import {
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
})