import { describe, expect, it } from 'vitest'
import {
  computeCarryForwardOpeningBalance,
  invoiceGrossCents,
  invoiceTotalCents,
  resolveCarryStatementBalance,
  resolvePaymentLedgerEntryType,
  sumLedgerBalance,
  unpaidInvoiceContributionCents,
  type CarryForwardBreakdown,
} from './settlementLedger'
import type { LedgerEntry } from './settlementLedger'

describe('settlementLedger helpers', () => {
  it('sums ledger entry amounts', () => {
    const entries: LedgerEntry[] = [
      {
        id: '1',
        artistId: 'a',
        settlementPeriodId: 'p',
        entryType: 'statement_payout',
        amountEur: 100,
        currency: undefined,
        amountOriginal: undefined,
        fxRate: undefined,
        referenceType: undefined,
        referenceId: undefined,
        description: undefined,
        createdBy: undefined,
        createdAt: '2026-01-01',
      },
      {
        id: '2',
        artistId: 'a',
        settlementPeriodId: 'p',
        entryType: 'payment',
        amountEur: -40,
        currency: undefined,
        amountOriginal: undefined,
        fxRate: undefined,
        referenceType: undefined,
        referenceId: undefined,
        description: undefined,
        createdBy: undefined,
        createdAt: '2026-01-02',
      },
    ]

    expect(sumLedgerBalance(entries)).toBe(60)
  })

  it('computes carry-forward opening balance from breakdown', () => {
    const breakdown: CarryForwardBreakdown = {
      statementBalanceEur: 50,
      unpaidInvoiceCents: 2500,
      partialPaymentRemainderCents: 1000,
    }

    expect(computeCarryForwardOpeningBalance(breakdown)).toBe(85)
  })

  it('totals invoice line items in cents', () => {
    expect(
      invoiceTotalCents([
        { qty: 1, unit_price_cents: 12500 },
        { qty: 2, unit_price_cents: 500 },
      ]),
    ).toBe(13500)
  })

  it('computes gross invoice total with VAT', () => {
    expect(invoiceGrossCents([{ qty: 1, unit_price_cents: 10000 }], 19)).toBe(11900)
    expect(invoiceGrossCents([{ qty: 1, unit_price_cents: 10000 }], 0)).toBe(10000)
  })

  it('uses ledger balance when ledger rows exist even if the sum is 0', () => {
    expect(resolveCarryStatementBalance(true, 0, 80)).toBe(0)
    expect(resolveCarryStatementBalance(false, 0, 80)).toBe(80)
  })

  it('prefers outstanding cents over recomputed invoice gross', () => {
    expect(
      unpaidInvoiceContributionCents({
        status: 'sent',
        outstanding_amount_cents: 5000,
        paid_amount_cents: 0,
        line_items: [{ qty: 1, unit_price_cents: 10000 }],
      }),
    ).toBe(5000)
    expect(
      unpaidInvoiceContributionCents({
        status: 'sent',
        outstanding_amount_cents: null,
        paid_amount_cents: 0,
        line_items: [{ qty: 1, unit_price_cents: 10000 }],
      }),
    ).toBe(10000)
    expect(
      unpaidInvoiceContributionCents({
        status: 'paid',
        outstanding_amount_cents: 0,
        paid_amount_cents: 11900,
        line_items: [{ qty: 1, unit_price_cents: 10000 }],
      }),
    ).toBe(0)
  })

  it('skips a second payment ledger row when invoice_liability already exists', () => {
    expect(resolvePaymentLedgerEntryType(true, 'paid')).toBeNull()
    expect(resolvePaymentLedgerEntryType(true, 'partially_paid')).toBeNull()
    expect(resolvePaymentLedgerEntryType(false, 'paid')).toBe('payment')
    expect(resolvePaymentLedgerEntryType(false, 'partially_paid')).toBe('partial_payment')
  })
})