import type { LedgerEntry, LedgerEntryType } from '@/lib/api/settlementLedger'
import { sumLedgerBalance } from '@/lib/api/settlementLedger'

const BALANCE_TOLERANCE_EUR = 0.005

/** Expected sign by entry type (correction may be ±). */
export const LEDGER_ENTRY_EXPECTED_SIGN: Partial<
  Record<Exclude<LedgerEntryType, 'correction'>, 'positive' | 'negative'>
> = {
  invoice_liability: 'negative',
  payment: 'negative',
  partial_payment: 'negative',
  carry_out: 'negative',
}

export interface LedgerInvariantIssue {
  entryId: string
  entryType: LedgerEntryType
  amountEur: number
  message: string
}

export function validateLedgerEntrySigns(entries: LedgerEntry[]): LedgerInvariantIssue[] {
  const issues: LedgerInvariantIssue[] = []

  for (const entry of entries) {
    if (entry.entryType === 'correction') {
      if (entry.amountEur === 0) {
        issues.push({
          entryId: entry.id,
          entryType: entry.entryType,
          amountEur: entry.amountEur,
          message: 'Correction entry must be non-zero',
        })
      }
      continue
    }

    const expected = LEDGER_ENTRY_EXPECTED_SIGN[entry.entryType]
    if (!expected) continue
    const invalid =
      (expected === 'positive' && entry.amountEur <= 0) ||
      (expected === 'negative' && entry.amountEur >= 0)

    if (invalid) {
      issues.push({
        entryId: entry.id,
        entryType: entry.entryType,
        amountEur: entry.amountEur,
        message: `Expected ${expected} amount for ${entry.entryType}`,
      })
    }
  }

  return issues
}

export interface RegisterBalanceSnapshot {
  artistId: string
  ledgerBalanceEur: number
}

export interface RegisterReconciliationResult {
  ok: boolean
  computedOpenBalanceEur: number
  reportedOpenBalanceEur: number
  deltaEur: number
}

/**
 * Verifies register KPI open balance equals sum of per-artist ledger balances.
 */
export function reconcileRegisterOpenBalance(
  rows: RegisterBalanceSnapshot[],
  reportedOpenBalanceEur: number,
): RegisterReconciliationResult {
  const computedOpenBalanceEur = rows.reduce((sum, row) => sum + row.ledgerBalanceEur, 0)
  const deltaEur = computedOpenBalanceEur - reportedOpenBalanceEur
  return {
    ok: Math.abs(deltaEur) <= BALANCE_TOLERANCE_EUR,
    computedOpenBalanceEur,
    reportedOpenBalanceEur,
    deltaEur,
  }
}

export interface StatementInvoicePaymentSnapshot {
  statementPayoutEur: number
  invoiceLiabilityEur: number
  paymentsEur: number
  carryInEur: number
  carryOutEur: number
  correctionsEur: number
}

/**
 * Pure expected balance from component totals (for reconciliation tests and diagnostics).
 */
export function computeExpectedBalanceFromComponents(
  snapshot: StatementInvoicePaymentSnapshot,
): number {
  return (
    snapshot.statementPayoutEur +
    snapshot.invoiceLiabilityEur +
    snapshot.paymentsEur +
    snapshot.carryInEur +
    snapshot.carryOutEur +
    snapshot.correctionsEur
  )
}

export function reconcileLedgerBalanceToComponents(
  entries: LedgerEntry[],
  snapshot: StatementInvoicePaymentSnapshot,
): { ok: boolean; ledgerBalanceEur: number; expectedEur: number; deltaEur: number } {
  const ledgerBalanceEur = sumLedgerBalance(entries)
  const expectedEur = computeExpectedBalanceFromComponents(snapshot)
  const deltaEur = ledgerBalanceEur - expectedEur
  return {
    ok: Math.abs(deltaEur) <= BALANCE_TOLERANCE_EUR,
    ledgerBalanceEur,
    expectedEur,
    deltaEur,
  }
}