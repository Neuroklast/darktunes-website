import { describe, it, expect } from 'vitest'
import { parsePartnerListParams, PARTNER_API_MAX_LIMIT } from './listParams'

describe('parsePartnerListParams', () => {
  it('uses defaults when query params are absent', () => {
    const result = parsePartnerListParams('http://localhost/api/v1/artists')
    expect(result.limit).toBe(50)
    expect(result.cursor).toBeUndefined()
  })

  it('caps limit at max and parses cursor', () => {
    const result = parsePartnerListParams(
      'http://localhost/api/v1/artists?limit=999&cursor=2026-01-01T00:00:00Z',
    )
    expect(result.limit).toBe(PARTNER_API_MAX_LIMIT)
    expect(result.cursor).toBe('2026-01-01T00:00:00Z')
  })
})