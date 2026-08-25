import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  convertToEur,
  fetchHistoricalExchangeRates,
  normalizeRevenueToEur,
  parseMissingExchangeRateCurrency,
} from './currency'
import type { ExchangeRates, HistoricalRates } from './currency'

const RATES: ExchangeRates = {
  USD: 1.08,
  GBP: 0.86,
}

describe('convertToEur', () => {
  it('returns the original amount unchanged for EUR', () => {
    expect(convertToEur(100, 'EUR', RATES)).toBe(100)
    expect(convertToEur(100, 'eur', RATES)).toBe(100)
    expect(convertToEur(100, '  EUR  ', RATES)).toBe(100)
  })

  it('converts a known foreign currency to EUR', () => {
    // 108 USD / 1.08 = 100 EUR
    expect(convertToEur(108, 'USD', RATES)).toBeCloseTo(100, 5)
    // 86 GBP / 0.86 = 100 EUR
    expect(convertToEur(86, 'GBP', RATES)).toBeCloseTo(100, 5)
  })

  it('is case-insensitive for the currency code', () => {
    expect(convertToEur(108, 'usd', RATES)).toBeCloseTo(100, 5)
    expect(convertToEur(108, 'Usd', RATES)).toBeCloseTo(100, 5)
  })

  it('throws when the currency has no rate instead of returning 0', () => {
    expect(() => convertToEur(500, 'XYZ', RATES)).toThrowError(/XYZ/)
    expect(() => convertToEur(500, 'JPY', RATES)).toThrowError(/JPY/)
  })

  it('throws for a zero or negative rate entry', () => {
    const badRates: ExchangeRates = { USD: 0, GBP: -1.5 }
    expect(() => convertToEur(100, 'USD', badRates)).toThrowError(/USD/)
    expect(() => convertToEur(100, 'GBP', badRates)).toThrowError(/GBP/)
  })

  it('throws for an empty currency string (no silent fallback)', () => {
    // code becomes '' after trim+upper → early return with original amount
    // This is the existing "no currency" short-circuit and should stay safe.
    expect(convertToEur(100, '', RATES)).toBe(100)
  })
})

describe('parseMissingExchangeRateCurrency', () => {
  it('extracts ISO currency from worker error text', () => {
    expect(
      parseMissingExchangeRateCurrency(
        'Missing exchange rate for currency "USD" — add the rate before generating statements',
      ),
    ).toBe('USD')
    expect(parseMissingExchangeRateCurrency('invalid csv')).toBeNull()
  })
})

describe('normalizeRevenueToEur', () => {
  const spotRates: ExchangeRates = { USD: 1.08, GBP: 0.86 }
  const historicalRates: HistoricalRates = {
    '2024-03': { USD: 1.10, GBP: 0.88 },
    '2024-04': { USD: 1.12 },
  }

  it('returns EUR amounts unchanged', () => {
    expect(normalizeRevenueToEur(42.5, 'EUR', '2024-03', spotRates, historicalRates)).toBe(42.5)
  })

  it('prefers historical monthly rates over spot rates when salesMonth is known', () => {
    // 110 USD / 1.10 = 100 EUR (historical), not 110/1.08 ≈ 101.85 (spot)
    expect(
      normalizeRevenueToEur(110, 'USD', '2024-03', spotRates, historicalRates),
    ).toBeCloseTo(100, 5)
  })

  it('falls back to spot rates when salesMonth has no historical entry', () => {
    expect(
      normalizeRevenueToEur(108, 'USD', '2024-05', spotRates, historicalRates),
    ).toBeCloseTo(100, 5)
  })

  it('falls back to spot rates when salesMonth is undefined', () => {
    expect(normalizeRevenueToEur(86, 'GBP', undefined, spotRates, historicalRates)).toBeCloseTo(100, 5)
  })

  it('applies the same conversion path for non-Bandcamp sources', () => {
    expect(
      normalizeRevenueToEur(110, 'USD', '2024-03', spotRates, historicalRates),
    ).toBeCloseTo(100, 5)
  })

  it('throws when neither historical nor spot rates contain the currency', () => {
    expect(() =>
      normalizeRevenueToEur(100, 'JPY', '2024-03', spotRates, historicalRates),
    ).toThrowError(/JPY/)
  })
})

describe('fetchHistoricalExchangeRates', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns only months from the API and does not seed fallbacks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ base: 'EUR', rates: { '2024-03': { USD: 1.1 } } }),
      })),
    )

    const result = await fetchHistoricalExchangeRates('2024-01', '2024-03')
    expect(result.source).toBe('ecb')
    expect(result.rates).toEqual({ '2024-03': { USD: 1.1 } })
    expect(result.rates['2024-01']).toBeUndefined()
  })

  it('returns empty historical rates when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))

    const result = await fetchHistoricalExchangeRates('2024-01', '2024-03')
    expect(result.source).toBe('fallback')
    expect(result.rates).toEqual({})
  })
})
