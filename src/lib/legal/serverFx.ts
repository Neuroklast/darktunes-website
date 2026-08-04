/**
 * Server-side ECB reference rates via Frankfurter (no API key).
 * Used for invoice PDF footnotes when currency ≠ EUR.
 */

import {
  FALLBACK_EXCHANGE_RATES,
  type ExchangeRateSource,
  type ExchangeRates,
} from '@/lib/sos/currency'

const FRANKFURTER_BASE = 'https://api.frankfurter.app'

export interface ServerFxQuote {
  base: 'EUR'
  currency: string
  /** Units of `currency` per 1 EUR (Frankfurter / ECB convention). */
  rate: number
  date: string
  source: ExchangeRateSource
}

/**
 * Fetch the latest ECB rate for one currency (1 EUR = rate units of currency).
 * Falls back to static approximate rates if Frankfurter is unreachable.
 */
export async function getEcbRateForCurrency(
  currency: string,
  options?: { fetch?: typeof fetch },
): Promise<ServerFxQuote | null> {
  const code = currency.trim().toUpperCase()
  if (!code || code === 'EUR') return null

  const fetchFn = options?.fetch ?? globalThis.fetch
  try {
    const res = await fetchFn(
      `${FRANKFURTER_BASE}/latest?from=EUR&to=${encodeURIComponent(code)}`,
      { headers: { Accept: 'application/json' } },
    )

    if (res.ok) {
      const data = (await res.json()) as {
        base?: string
        date?: string
        rates?: Record<string, number>
      }
      const rate = data.rates?.[code]
      if (typeof rate === 'number' && rate > 0) {
        return {
          base: 'EUR',
          currency: code,
          rate,
          date: data.date ?? new Date().toISOString().slice(0, 10),
          source: 'ecb',
        }
      }
    }
  } catch {
    // fall through
  }

  const fallback = FALLBACK_EXCHANGE_RATES[code]
  if (typeof fallback === 'number' && fallback > 0) {
    return {
      base: 'EUR',
      currency: code,
      rate: fallback,
      date: new Date().toISOString().slice(0, 10),
      source: 'fallback',
    }
  }

  return null
}

export function formatEcbRateNote(quote: ServerFxQuote): string {
  const sourceLabel = quote.source === 'ecb' ? 'EZB/Frankfurter' : 'Fallback-Kurs'
  return `Referenzkurs (${sourceLabel}): 1 EUR = ${quote.rate.toFixed(4)} ${quote.currency} (Stand ${quote.date}).`
}

/** Convert foreign amount to EUR using Frankfurter-style rates. */
export function foreignToEur(amount: number, rates: ExchangeRates, currency: string): number {
  const code = currency.toUpperCase()
  if (code === 'EUR') return amount
  const rate = rates[code]
  if (!rate || rate <= 0) {
    throw new Error(`Missing exchange rate for ${code}`)
  }
  return amount / rate
}
