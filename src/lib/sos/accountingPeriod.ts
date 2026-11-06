import { compareYearMonth, isValidYearMonth } from '@/lib/sos/accountingInputValidation'
import { monthToPeriodDate } from '@/lib/sos/lineItemsFromArtistData'

/**
 * The single, validated accounting period used by every operation (export,
 * settlement, carry-forward, workspace, analytics, payout, SEPA).
 *
 * `source` documents where the binding period came from. Detected source
 * reporting periods stay provenance information only; they never override a
 * manual choice and never fabricate a replacement period.
 */
export interface AccountingPeriod {
  /** `YYYY-MM` */
  startMonth: string
  /** `YYYY-MM` */
  endMonth: string
  /** `YYYY-MM-DD` first calendar day of the start month. */
  startDate: string
  /** `YYYY-MM-DD` last calendar day of the end month. */
  endDate: string
  source: 'manual' | 'detected'
}

export type AccountingPeriodError = 'missing' | 'invalid-month' | 'invalid-range'

export interface AccountingPeriodResolution {
  period: AccountingPeriod | null
  error: AccountingPeriodError | null
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

/**
 * Resolves the binding accounting period. Manual selection wins; detected
 * months are only used when nothing was selected manually. Invalid input
 * returns `period: null` with a reason — there is deliberately no fallback to
 * the current quarter/year or any other invented period.
 */
export function resolveAccountingPeriod(input: {
  manualStart?: string | null
  manualEnd?: string | null
  detectedStart?: string | null
  detectedEnd?: string | null
}): AccountingPeriodResolution {
  const manualStart = clean(input.manualStart)
  const manualEnd = clean(input.manualEnd)
  const detectedStart = clean(input.detectedStart)
  const detectedEnd = clean(input.detectedEnd)

  let source: AccountingPeriod['source']
  let startMonth: string
  let endMonth: string

  if (manualStart || manualEnd) {
    if (!manualStart) return { period: null, error: 'missing' }
    source = 'manual'
    startMonth = manualStart
    endMonth = manualEnd || manualStart
  } else if (detectedStart) {
    source = 'detected'
    startMonth = detectedStart
    endMonth = detectedEnd || detectedStart
  } else {
    return { period: null, error: 'missing' }
  }

  if (!isValidYearMonth(startMonth) || !isValidYearMonth(endMonth)) {
    return { period: null, error: 'invalid-month' }
  }
  const comparison = compareYearMonth(startMonth, endMonth)
  if (comparison == null || comparison > 0) {
    return { period: null, error: 'invalid-range' }
  }

  const startDate = monthToPeriodDate(startMonth, false)
  const endDate = monthToPeriodDate(endMonth, true)
  if (!startDate || !endDate) {
    return { period: null, error: 'invalid-month' }
  }

  return {
    period: { startMonth, endMonth, startDate, endDate, source },
    error: null,
  }
}

/** Inclusive count for a validated month range; null rather than guessing for invalid input. */
export function accountingPeriodMonths(start: string, end: string): number | null {
  if (!isValidYearMonth(start) || !isValidYearMonth(end)) return null
  const diff = compareYearMonth(end, start)
  return diff == null || diff < 0 ? null : diff + 1
}

/** Detect whether source-reporting dates are only partly included in a billing period. */
export function sourcePeriodOutside(
  billingStart: string,
  billingEnd: string,
  sourceStart: string,
  sourceEnd: string,
): boolean {
  if (accountingPeriodMonths(billingStart, billingEnd) == null ||
      accountingPeriodMonths(sourceStart, sourceEnd) == null) return false
  return (compareYearMonth(sourceStart, billingStart) ?? 0) < 0 ||
    (compareYearMonth(sourceEnd, billingEnd) ?? 0) > 0
}

/** Human-readable `YYYY-MM – YYYY-MM` label; a single month renders once. */
export function formatAccountingPeriodLabel(period: AccountingPeriod | null): string {
  if (!period) return ''
  return period.startMonth === period.endMonth
    ? period.startMonth
    : `${period.startMonth} – ${period.endMonth}`
}
