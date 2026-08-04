/** Artist tax status for § 14 UStG invoice generation. */
export type TaxStatus = 'standard' | 'small_business' | 'reverse_charge'

export const TAX_STATUS_VALUES: TaxStatus[] = ['standard', 'small_business', 'reverse_charge']

export function isTaxStatus(value: unknown): value is TaxStatus {
  return typeof value === 'string' && (TAX_STATUS_VALUES as string[]).includes(value)
}

export function parseTaxStatus(value: unknown, fallback: TaxStatus = 'standard'): TaxStatus {
  return isTaxStatus(value) ? value : fallback
}

/** Derive tax status from legacy is_small_business flag. */
export function taxStatusFromLegacy(isSmallBusiness: boolean): TaxStatus {
  return isSmallBusiness ? 'small_business' : 'standard'
}

export function isSmallBusinessStatus(status: TaxStatus): boolean {
  return status === 'small_business'
}

/** Effective VAT rate enforced by the server for invoice PDFs. */
export function taxRateForStatus(status: TaxStatus, requestedRate = 19): number {
  if (status === 'small_business' || status === 'reverse_charge') return 0
  return requestedRate
}

export function taxNoticeForStatus(status: TaxStatus): string | null {
  if (status === 'small_business') {
    return 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
  }
  if (status === 'reverse_charge') {
    return 'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).'
  }
  return null
}
