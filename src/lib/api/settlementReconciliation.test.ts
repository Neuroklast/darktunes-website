import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '@/lib/api/settlementLedger'
import {
  computeExpectedBalanceFromComponents,
  reconcileLedgerBalanceToComponents,
  reconcileRegisterOpenBalance,
  validateLedgerEntrySigns,
} from './settlementReconciliation'

function entry(
  partial: Pick<LedgerEntry, 'id' | 'entryType' | 'amountEur'>,
): LedgerEntry {
  return {
    artistId: 'artist-1',
    settlementPeriodId: 'period-1',
    currency: undefined,
    amountOriginal: undefined,
    fxRate: undefined,
    referenceType: undefined,
    referenceId: undefined,
    description: undefined,
    createdBy: undefined,
    createdAt: '2026-01-01',
    ...partial,
  }
}

describe('settlementReconciliation', () => {
  it('flags wrong sign conventions', () => {
    const issues = validateLedgerEntrySigns([
      entry({ id: '1', entryType: 'statement_payout', amountEur: 100 }),
      entry({ id: '2', entryType: 'payment', amountEur: 10 }),
      entry({ id: '3', entryType: 'invoice_liability', amountEur: -50 }),
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.entryId).toBe('2')
  })

  it('allows negative statement_payout and carry_in (expense / debit opening)', () => {
    const issues = validateLedgerEntrySigns([
      entry({ id: '1', entryType: 'statement_payout', amountEur: -25 }),
      entry({ id: '2', entryType: 'carry_in', amountEur: -10 }),
      entry({ id: '3', entryType: 'invoice_liability', amountEur: -50 }),
    ])
    expect(issues).toHaveLength(0)
  })

  it('reconciles register KPI with row ledger balances', () => {
    const result = reconcileRegisterOpenBalance(
      [
        { artistId: 'a', ledgerBalanceEur: 120 },
        { artistId: 'b', ledgerBalanceEur: -20 },
        { artistId: 'c', ledgerBalanceEur: 5.5 },
      ],
      105.5,
    )
    expect(result.ok).toBe(true)
    expect(result.computedOpenBalanceEur).toBe(105.5)
  })

  it('matches ledger sum to component snapshot (liability zeros payout; no payment double-book)', () => {
    // Model: payout + liability cancel; cash remaining tracked on invoices, not payment ledger rows.
    const entries: LedgerEntry[] = [
      entry({ id: '1', entryType: 'carry_in', amountEur: 10 }),
      entry({ id: '2', entryType: 'statement_payout', amountEur: 100 }),
      entry({ id: '3', entryType: 'invoice_liability', amountEur: -100 }),
      entry({ id: '4', entryType: 'correction', amountEur: 5 }),
    ]

    const snapshot = {
      statementPayoutEur: 100,
      invoiceLiabilityEur: -100,
      paymentsEur: 0,
      carryInEur: 10,
      carryOutEur: 0,
      correctionsEur: 5,
    }

    expect(computeExpectedBalanceFromComponents(snapshot)).toBe(15)
    const result = reconcileLedgerBalanceToComponents(entries, snapshot)
    expect(result.ok).toBe(true)
    expect(result.ledgerBalanceEur).toBe(15)
  })
})