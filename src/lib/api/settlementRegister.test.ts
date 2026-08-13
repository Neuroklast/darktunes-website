import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildSettlementRegister, computeCarryForwardBalances } from './settlementRegister'

type DbClient = SupabaseClient<Database>

const mockPeriod = {
  id: 'period-1',
  periodStart: '2025-01-01',
  periodEnd: '2025-03-31',
  status: 'open' as const,
  createdAt: '2024-01-01T00:00:00Z',
}

vi.mock('@/lib/api/settlementPeriods', () => ({
  getSettlementPeriodByDates: vi.fn(async () => mockPeriod),
  getOrCreateSettlementPeriod: vi.fn(async () => mockPeriod),
}))

vi.mock('@/lib/api/salesStatements', () => ({
  getSalesStatementsForPeriod: vi.fn(async () => [
    {
      id: 'stmt-1',
      artist_id: 'artist-1',
      status: 'label_approved',
      first_viewed_at: '2025-02-01T00:00:00Z',
      amount_eur: 500,
    },
    {
      id: 'stmt-2',
      artist_id: 'artist-2',
      status: 'draft',
      first_viewed_at: null,
      amount_eur: 200,
    },
  ]),
}))

vi.mock('@/lib/api/artistInvoices', () => ({
  listInvoicesByStatementIds: vi.fn(async () => [
    {
      id: 'inv-1',
      statementId: 'stmt-1',
      status: 'sent',
      artistInvoiceNumber: 'INV-001',
      invoiceNumber: 'INV-001',
      receivedAt: undefined,
      paidAt: undefined,
      paidAmountCents: 0,
      outstandingAmountCents: 50000,
    },
  ]),
}))

vi.mock('@/lib/api/settlementLedger', () => ({
  getOutstandingBalancesForPeriod: vi.fn(async () => new Map([['artist-1', 120]])),
  getArtistOutstandingBalance: vi.fn(async (_db, artistId: string) => {
    if (artistId === 'artist-1') return 120
    if (artistId === 'artist-2') return 0
    return 0
  }),
  computeCarryForwardOpeningBalance: vi.fn((breakdown: { statementBalanceEur: number; unpaidInvoiceCents: number; partialPaymentRemainderCents: number }) =>
    breakdown.statementBalanceEur + breakdown.unpaidInvoiceCents / 100 + breakdown.partialPaymentRemainderCents / 100,
  ),
  invoiceTotalCents: vi.fn((items: Array<{ qty: number; unit_price_cents: number }>) =>
    items.reduce((sum, item) => sum + item.qty * item.unit_price_cents, 0),
  ),
  invoiceGrossCents: vi.fn(
    (items: Array<{ qty: number; unit_price_cents: number }>, taxRatePct: number) => {
      const net = items.reduce((sum, item) => sum + item.qty * item.unit_price_cents, 0)
      return net + Math.round(net * (taxRatePct / 100))
    },
  ),
}))

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeDb(tableData: Record<string, unknown>): DbClient {
  return {
    from: vi.fn((table: string) => makeBuilder(tableData[table] ?? null)),
  } as unknown as DbClient
}

describe('buildSettlementRegister', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds register rows with KPIs for artists with statements or open balances', async () => {
    const db = makeDb({
      artists: [
        { id: 'artist-1', name: 'Neuroklast' },
        { id: 'artist-2', name: 'Guest Act' },
        { id: 'artist-3', name: 'Idle Act' },
      ],
      period_carry_forwards: [],
    })

    const register = await buildSettlementRegister(db, '2025-01-01', '2025-03-31')

    expect(register.period?.id).toBe('period-1')
    expect(register.rows).toHaveLength(2)
    expect(register.rows.map(r => r.artistName).sort()).toEqual(['Guest Act', 'Neuroklast'])

    const neuro = register.rows.find(r => r.artistId === 'artist-1')
    expect(neuro).toMatchObject({
      statementStatus: 'label_approved',
      invoiceStatus: 'sent',
      ledgerBalanceEur: 120,
      statementAmountEur: 500,
    })

    expect(register.kpis.approved).toBe(1)
    expect(register.kpis.invoiced).toBe(1)
    expect(register.kpis.openBalanceEur).toBe(120)
  })

  it('includes carry-forward and opening balance from period_carry_forwards', async () => {
    const db = makeDb({
      artists: [{ id: 'artist-1', name: 'Neuroklast' }],
      period_carry_forwards: [
        { artist_id: 'artist-1', opening_balance_eur: 15.5, from_period_id: 'period-1', to_period_id: 'period-2' },
      ],
    })

    const register = await buildSettlementRegister(db, '2025-01-01', '2025-03-31')
    const row = register.rows.find(r => r.artistId === 'artist-1')
    expect(row?.carryForwardEur).toBe(15.5)
    expect(row?.openingBalanceEur).toBe(15.5)
  })
})

describe('computeCarryForwardBalances', () => {
  it('returns non-zero opening balances for artists with outstanding amounts', async () => {
    const db = makeDb({
      sales_statements: [
        { id: 'stmt-1', artist_id: 'artist-1', amount_eur: 80, status: 'label_approved' },
      ],
      artist_invoices: [
        {
          artist_id: 'artist-1',
          settlement_period_id: 'period-1',
          line_items: [{ qty: 1, unit_price_cents: 2500 }],
          paid_amount_cents: 0,
          outstanding_amount_cents: 2500,
          status: 'sent',
        },
      ],
    })

    const balances = await computeCarryForwardBalances(db, 'period-1')

    expect(balances).toHaveLength(1)
    expect(balances[0]?.artistId).toBe('artist-1')
    expect(balances[0]?.openingBalanceEur).toBeGreaterThan(0)
    expect(balances[0]?.breakdown.unpaidInvoiceCents).toBe(2500)
  })

  it('skips artists with negligible carry-forward totals', async () => {
    const db = makeDb({
      sales_statements: [
        { id: 'stmt-1', artist_id: 'artist-2', amount_eur: 0.001, status: 'paid' },
      ],
      artist_invoices: [],
    })

    const balances = await computeCarryForwardBalances(db, 'period-1')
    expect(balances).toHaveLength(0)
  })
})