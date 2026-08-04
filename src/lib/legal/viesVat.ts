/**
 * EU VIES (MIAS) VAT ID validation — official European Commission service.
 *
 * Uses the free REST API (no API key). VAT numbers never leave our server
 * except to the Commission’s VIES endpoint for legal verification.
 *
 * @see https://ec.europa.eu/taxation_customs/vies/
 */

export const EU_VAT_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',
] as const

export type EuVatCountryCode = (typeof EU_VAT_COUNTRY_CODES)[number]

const VIES_CHECK_URL =
  'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number'

export interface ParsedVatId {
  countryCode: string
  vatNumber: string
  /** Normalised compact form: COUNTRY + number without spaces (e.g. ESB12345678). */
  compact: string
}

export type ViesCheckStatus =
  | 'valid'
  | 'invalid'
  | 'not_eu'
  | 'malformed'
  | 'service_unavailable'
  | 'skipped'

export interface ViesCheckResult {
  status: ViesCheckStatus
  valid: boolean
  countryCode?: string
  vatNumber?: string
  compact?: string
  traderName?: string
  traderAddress?: string
  requestDate?: string
  requestIdentifier?: string
  message?: string
}

export type FetchLike = typeof fetch

/** True when the 2-letter code is an EU member for VIES (Greece = EL). */
export function isEuVatCountry(code: string): code is EuVatCountryCode {
  return (EU_VAT_COUNTRY_CODES as readonly string[]).includes(code.toUpperCase())
}

/**
 * Parse a VAT ID like "DE123456789", "ES B12345678", "EL999999999".
 * Greece may be entered as GR — normalised to EL for VIES.
 */
export function parseVatId(raw: string | null | undefined): ParsedVatId | null {
  if (!raw?.trim()) return null
  const compact = raw.replace(/[\s.-]/g, '').toUpperCase()
  const match = /^([A-Z]{2})([A-Z0-9]{2,12})$/.exec(compact)
  if (!match) return null
  let countryCode = match[1]!
  const vatNumber = match[2]!
  if (countryCode === 'GR') countryCode = 'EL'
  return { countryCode, vatNumber, compact: `${countryCode}${vatNumber}` }
}

/**
 * Live VIES check. Returns structured status; never throws on invalid VAT
 * (only network/parse failures become service_unavailable).
 */
export async function checkVatWithVies(
  rawVatId: string,
  options?: { fetch?: FetchLike; timeoutMs?: number },
): Promise<ViesCheckResult> {
  const parsed = parseVatId(rawVatId)
  if (!parsed) {
    return { status: 'malformed', valid: false, message: 'VAT ID format is invalid' }
  }

  if (!isEuVatCountry(parsed.countryCode)) {
    return {
      status: 'not_eu',
      valid: false,
      countryCode: parsed.countryCode,
      vatNumber: parsed.vatNumber,
      compact: parsed.compact,
      message: 'Country is not in the EU VIES system',
    }
  }

  const fetchFn = options?.fetch ?? globalThis.fetch
  const timeoutMs = options?.timeoutMs ?? 12_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchFn(VIES_CHECK_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        countryCode: parsed.countryCode,
        vatNumber: parsed.vatNumber,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return {
        status: 'service_unavailable',
        valid: false,
        countryCode: parsed.countryCode,
        vatNumber: parsed.vatNumber,
        compact: parsed.compact,
        message: `VIES HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as {
      valid?: boolean
      isValid?: boolean
      requestDate?: string
      userError?: string
      name?: string
      address?: string
      requestIdentifier?: string
      // Alternate shapes used by some VIES JSON gateways
      vatNumber?: string
      countryCode?: string
    }

    const isValid = Boolean(data.valid ?? data.isValid)
    if (data.userError && !isValid) {
      // MS_UNAVAILABLE etc. — treat as service issue, not hard invalid
      const err = data.userError.toUpperCase()
      if (
        err.includes('UNAVAILABLE') ||
        err.includes('MS_MAX') ||
        err.includes('TIMEOUT') ||
        err.includes('SERVICE')
      ) {
        return {
          status: 'service_unavailable',
          valid: false,
          countryCode: parsed.countryCode,
          vatNumber: parsed.vatNumber,
          compact: parsed.compact,
          message: data.userError,
        }
      }
    }

    return {
      status: isValid ? 'valid' : 'invalid',
      valid: isValid,
      countryCode: parsed.countryCode,
      vatNumber: parsed.vatNumber,
      compact: parsed.compact,
      traderName: typeof data.name === 'string' && data.name !== '---' ? data.name : undefined,
      traderAddress:
        typeof data.address === 'string' && data.address !== '---' ? data.address : undefined,
      requestDate: data.requestDate,
      requestIdentifier: data.requestIdentifier,
      message: isValid ? undefined : 'VAT ID is not valid in VIES',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'VIES request failed'
    return {
      status: 'service_unavailable',
      valid: false,
      countryCode: parsed.countryCode,
      vatNumber: parsed.vatNumber,
      compact: parsed.compact,
      message,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Whether reverse-charge invoicing is allowed for this VIES result.
 * Requires a positive VIES valid response (not unavailable).
 */
export function isViesValidForReverseCharge(result: ViesCheckResult): boolean {
  return result.status === 'valid' && result.valid
}
