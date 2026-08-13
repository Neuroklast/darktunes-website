/**
 * Currency conversion utilities using the Frankfurter API (ECB reference rates).
 *
 * The API returns rates relative to EUR as the base currency:
 *   { "base": "EUR", "rates": { "USD": 1.05, "GBP": 0.85, ... } }
 *
 * To convert X units of a foreign currency to EUR:
 *   eur_amount = foreign_amount / rates[currency]
 */

/** Flat exchange-rate map: currency code → units per 1 EUR. */
export type ExchangeRates = Record<string, number>

export type ExchangeRateSource = 'ecb' | 'fallback'

export type ExchangeRateFetchResult = {
  rates: ExchangeRates
  source: ExchangeRateSource
}

/**
 * Historical monthly exchange rates: month key ("YYYY-MM") → flat rate map.
 * Returned by `fetchHistoricalExchangeRates` when a billing period is known.
 * Each month entry contains the ECB monthly average (mean of all trading days).
 */
export type HistoricalRates = Record<string, ExchangeRates>

export type HistoricalExchangeRateFetchResult = {
  rates: HistoricalRates
  source: ExchangeRateSource
}

/**
 * Static fallback rates used when the Frankfurter API is unavailable.
 * These are approximate values and should only be used as a last resort.
 * Exported so callers can seed state on unexpected fetch failures.
 */
export const FALLBACK_EXCHANGE_RATES: ExchangeRates = {
  USD: 1.08,
  GBP: 0.86,
  CHF: 0.96,
  PLN: 4.25,
  CZK: 25.2,
  SEK: 11.5,
  DKK: 7.46,
  NOK: 11.8,
  HUF: 395.0,
  RON: 4.97,
  BGN: 1.96,
  HRK: 7.53,
  CAD: 1.46,
  AUD: 1.65,
  NZD: 1.80,
  JPY: 162.0,
  CNY: 7.82,
  BRL: 5.85,
  MXN: 18.5,
  RUB: 99.0,
  INR: 90.0,
  KRW: 1470.0,
  ZAR: 20.5,
  TRY: 35.0,
}

/** Detect worker/UI error messages for missing FX rates (English throw text). */
export function parseMissingExchangeRateCurrency(message: string): string | null {
  const match = message.match(/Missing exchange rate for currency "([A-Z]{3})"/i)
  return match?.[1] ?? null
}

/**
 * Fetches current exchange rates via the /api/exchange-rates proxy.
 *
 * The proxy (Vercel Edge Function in production, Vite dev-proxy locally)
 * forwards the request to the Frankfurter API server-side, avoiding the
 * CORS restriction that the upstream imposes on browser-originated requests.
 * Falls back to static approximate rates on any network or parse error.
 *
 * @returns A map of currency code → EUR-base rate (1 EUR = N units of that currency).
 */
export async function fetchExchangeRates(): Promise<ExchangeRateFetchResult> {
  try {
    const response = await fetch('/api/exchange-rates', {
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      console.warn(`[currency] Frankfurter API returned ${response.status} — using fallback rates`)
      return { rates: FALLBACK_EXCHANGE_RATES, source: 'fallback' }
    }
    const data = await response.json() as { base: string; rates: Record<string, number> }
    if (!data?.rates || typeof data.rates !== 'object') {
      console.warn('[currency] Unexpected Frankfurter API response shape — using fallback rates')
      return { rates: FALLBACK_EXCHANGE_RATES, source: 'fallback' }
    }
    return { rates: data.rates, source: 'ecb' }
  } catch (err) {
    console.warn('[currency] Failed to fetch exchange rates:', err instanceof Error ? err.message : err, '— using fallback rates')
    return { rates: FALLBACK_EXCHANGE_RATES, source: 'fallback' }
  }
}

/**
 * Fetches historical monthly average exchange rates for a billing period.
 *
 * Calls the `/api/exchange-rates?start=YYYY-MM&end=YYYY-MM` endpoint, which
 * proxies the Frankfurter time-series API and returns pre-aggregated monthly
 * averages (mean of all ECB trading days within each calendar month).
 *
 * Using monthly averages is the standard accounting method for retrospective
 * royalty statements: each transaction is converted at the ECB average rate
 * for the month in which the sale occurred.
 *
 * Does **not** pre-fill missing months with `FALLBACK_EXCHANGE_RATES`.
 * `normalizeRevenueToEur` uses spot rates when a month is absent, then throws
 * if that currency is still missing. A failed fetch returns `{}` + `fallback`
 * so the caller can keep spot (and the existing fallback-rate banner).
 *
 * @param periodStart - First month of the billing period, format "YYYY-MM".
 * @param periodEnd   - Last month of the billing period, format "YYYY-MM".
 * @returns A map of "YYYY-MM" → flat rate map (1 EUR = N units of currency).
 */
export async function fetchHistoricalExchangeRates(
  periodStart: string,
  periodEnd: string,
): Promise<HistoricalExchangeRateFetchResult> {
  try {
    const response = await fetch(
      `/api/exchange-rates?start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}`,
      { signal: AbortSignal.timeout(15000) },
    )
    if (!response.ok) {
      console.warn(
        `[currency] Historical exchange-rate API returned ${response.status} — no historical seed`,
      )
      return { rates: {}, source: 'fallback' }
    }
    const data = await response.json() as { base: string; rates: Record<string, Record<string, number>> }
    if (!data?.rates || typeof data.rates !== 'object') {
      console.warn('[currency] Unexpected historical exchange-rate response shape — no historical seed')
      return { rates: {}, source: 'fallback' }
    }

    const rates: HistoricalRates = {}
    for (const [month, monthRates] of Object.entries(data.rates)) {
      if (typeof monthRates === 'object' && monthRates !== null) {
        rates[month] = monthRates as ExchangeRates
      }
    }
    return { rates, source: 'ecb' }
  } catch (err) {
    console.warn(
      '[currency] Failed to fetch historical exchange rates:',
      err instanceof Error ? err.message : err,
      '— no historical seed; convert will use spot then throw',
    )
    return { rates: {}, source: 'fallback' }
  }
}

/**
 * Converts transaction net revenue to EUR using historical monthly rates when
 * available, otherwise spot rates. All distributor sources share this path.
 */
export function normalizeRevenueToEur(
  netRevenue: number,
  currency: string,
  salesMonth: string | undefined,
  exchangeRates: ExchangeRates = {},
  historicalExchangeRates: HistoricalRates = {},
): number {
  const code = currency.trim().toUpperCase()
  if (!code || code === 'EUR') return netRevenue

  const applicableRates =
    salesMonth && historicalExchangeRates[salesMonth]
      ? historicalExchangeRates[salesMonth]
      : exchangeRates

  return convertToEur(netRevenue, currency, applicableRates)
}

/**
 * Converts an amount in a foreign currency to EUR.
 *
 * @param amount   - Amount in the source currency.
 * @param currency - ISO 4217 currency code (e.g. "USD", "GBP").
 * @param rates    - Exchange rates map (1 EUR = N units of currency).
 * @returns The EUR-equivalent amount, or the original amount if the currency
 *          is already EUR.
 * @throws {Error} when no rate is available for `currency` in `rates` — callers
 *         must handle this to prevent silent revenue loss.
 */
export function convertToEur(amount: number, currency: string, rates: ExchangeRates): number {
  const code = currency.trim().toUpperCase()
  if (!code || code === 'EUR') return amount
  const rate = rates[code]
  if (!rate || rate <= 0) {
    // A missing rate must never silently zero-out an artist's earnings.
    // Throw so the caller (statement generator) aborts and forces the label
    // to supply the correct rate before any statement is sent.
    throw new Error(
      `Missing exchange rate for currency "${code}" — add the rate before generating statements`,
    )
  }
  return amount / rate
}
