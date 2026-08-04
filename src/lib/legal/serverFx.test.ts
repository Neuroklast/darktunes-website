import { describe, expect, it, vi } from 'vitest'
import { formatEcbRateNote, foreignToEur, getEcbRateForCurrency } from './serverFx'

describe('getEcbRateForCurrency', () => {
  it('returns null for EUR', async () => {
    expect(await getEcbRateForCurrency('EUR')).toBeNull()
  })

  it('returns ECB quote on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ base: 'EUR', date: '2026-08-01', rates: { USD: 1.1 } }),
    })
    const quote = await getEcbRateForCurrency('USD', {
      fetch: fetchMock as unknown as typeof fetch,
    })
    expect(quote).toMatchObject({
      base: 'EUR',
      currency: 'USD',
      rate: 1.1,
      date: '2026-08-01',
      source: 'ecb',
    })
  })

  it('falls back when Frankfurter fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'))
    const quote = await getEcbRateForCurrency('USD', {
      fetch: fetchMock as unknown as typeof fetch,
    })
    expect(quote?.source).toBe('fallback')
    expect(quote?.rate).toBeGreaterThan(0)
  })
})

describe('formatEcbRateNote', () => {
  it('includes currency and date', () => {
    const note = formatEcbRateNote({
      base: 'EUR',
      currency: 'GBP',
      rate: 0.85,
      date: '2026-01-15',
      source: 'ecb',
    })
    expect(note).toContain('GBP')
    expect(note).toContain('2026-01-15')
    expect(note).toContain('0.8500')
  })
})

describe('foreignToEur', () => {
  it('divides by rate', () => {
    expect(foreignToEur(110, { USD: 1.1 }, 'USD')).toBeCloseTo(100)
  })

  it('passes EUR through', () => {
    expect(foreignToEur(50, {}, 'EUR')).toBe(50)
  })
})
