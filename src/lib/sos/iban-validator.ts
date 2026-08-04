/**
 * iban-validator.ts
 *
 * Pure IBAN validation implementing the ISO 7064 Modulo 97 algorithm
 * (as specified in ISO 13616 / ECBS EBS204).
 *
 * **DSGVO / privacy:** Bank account numbers MUST be validated only with this
 * local implementation (or equivalent in-process library). Never send IBAN/BIC
 * to third-party “IBAN validation” SaaS APIs.
 *
 * No external dependencies are used. BigInt is required for the Modulo 97
 * check to avoid floating-point precision loss when working with the
 * numeric representation of long IBANs (up to 34 digits).
 *
 * Reference: https://en.wikipedia.org/wiki/International_Bank_Account_Number
 */

/**
 * Fixed expected lengths per ISO 3166-1 alpha-2 country code.
 * Used as an additional sanity check after the checksum passes.
 * Countries not in this map are still validated structurally but without
 * a length constraint (unknown/exotic country codes pass length check).
 *
 * Source: ISO 13616 IBAN Registry (March 2024).
 */
const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18,
  DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22,
  GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22,
  IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28,
  LC: 32, LI: 21, LT: 20, LU: 20, LY: 25, MC: 27, MD: 24, ME: 22,
  MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28,
  PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SD: 18,
  SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24,
  TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
}

/**
 * Sanitises a raw IBAN string for comparison:
 * removes all whitespace and hyphens, converts to uppercase.
 *
 * @param raw - The raw IBAN string as entered by the user.
 * @returns The sanitised IBAN ready for validation.
 */
export function sanitiseIBAN(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase()
}

/**
 * Converts an IBAN character to its numeric equivalent for the Modulo 97 check.
 * Digits 0–9 map to themselves; letters A–Z map to 10–35.
 *
 * @param char - A single uppercase alphanumeric character.
 * @returns The numeric string representation (one or two digits).
 */
function charToNumeric(char: string): string {
  const code = char.charCodeAt(0)
  // ASCII 'A' = 65 → 10, 'Z' = 90 → 35
  if (code >= 65 && code <= 90) return String(code - 55)
  // Digits 0–9 pass through unchanged
  return char
}

/**
 * Validates an International Bank Account Number (IBAN) using a three-phase
 * check: structural regex, optional country-specific length, and ISO 7064
 * Modulo 97 cryptographic checksum.
 *
 * **Validation steps (in order):**
 * 1. Sanitisation — strip whitespace/hyphens and upper-case.
 * 2. Regex structural check — two letters (country code), two digits
 *    (check digits), followed by 11–30 alphanumeric BBAN characters.
 * 3. Country-specific length check — verified against ISO 13616 registry
 *    when the country code is known; unknown codes pass this step.
 * 4. ISO 7064 Modulo 97 check:
 *    - Rearrange: move the first 4 characters to the end of the string.
 *    - Convert all letters to their numeric equivalents (A=10 … Z=35).
 *    - Interpret the resulting string as a `BigInt` to avoid floating-point
 *      precision loss on long strings.
 *    - The IBAN is valid iff `numericValue % 97n === 1n`.
 *
 * @param raw - The IBAN string exactly as entered (spaces and mixed-case are tolerated).
 * @returns `true` when the IBAN is structurally valid and the checksum passes.
 *
 * @example
 * isValidIBAN('DE89 3704 0044 0532 0130 00') // true
 * isValidIBAN('DE00 3704 0044 0532 0130 00') // false (bad checksum)
 * isValidIBAN('XX12 1234')                   // false (too short)
 */
export function isValidIBAN(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false

  // ── Step 1: Sanitise ───────────────────────────────────────────────────────
  const iban = sanitiseIBAN(raw)
  if (iban.length === 0) return false

  // ── Step 2: Structural regex ───────────────────────────────────────────────
  // ISO 13616 BBAN length range: 11–30 characters → total IBAN: 15–34 chars.
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false

  // ── Step 3: Country-specific length check ──────────────────────────────────
  const countryCode = iban.slice(0, 2)
  const expectedLength = IBAN_LENGTHS[countryCode]
  if (expectedLength !== undefined && iban.length !== expectedLength) return false

  // ── Step 4: ISO 7064 Modulo 97 ────────────────────────────────────────────
  // Rearrange: move first 4 characters (country + check digits) to the end.
  const rearranged = iban.slice(4) + iban.slice(0, 4)

  // Convert each character to its numeric equivalent and concatenate.
  const numericString = rearranged.split('').map(charToNumeric).join('')

  try {
    // BigInt prevents precision loss on long IBAN numeric strings (up to ~34 digits).
    return BigInt(numericString) % 97n === 1n
  } catch {
    // BigInt constructor throws on malformed input — treat as invalid.
    return false
  }
}

/**
 * Masks an IBAN for display, revealing only the country code (first 4 chars)
 * and the last 4 digits. Intermediate groups are replaced with `****`.
 *
 * Example: `"DE89370400440532013000"` → `"DE89 **** **** **** 3000"`
 *
 * @param raw - Raw or formatted IBAN string.
 * @returns A masked IBAN string safe to display in tables and UI.
 */
export function maskIBAN(raw: string): string {
  const iban = sanitiseIBAN(raw)
  if (iban.length < 5) return raw

  const visible4 = iban.slice(0, 4)
  const tail4    = iban.slice(-4)
  const middleLen = iban.length - 8

  if (middleLen <= 0) return `${visible4} ${tail4}`

  // Build masked middle groups of 4 characters
  const maskedGroups = Math.ceil(middleLen / 4)
  const masked = Array(maskedGroups).fill('****').join(' ')

  return `${visible4} ${masked} ${tail4}`
}
