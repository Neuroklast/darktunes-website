import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  computeCarryForwardOpeningBalance,
  getArtistOutstandingBalance,
  invoiceGrossCents,
  type CarryForwardBreakdown,
} from '@/lib/api/settlementLedger'
import { reconcileRegisterOpenBalance } from '@/lib/api/settlementReconciliation'
import { listInvoicesByStatementIds } from '@/lib/api/artistInvoices'
import { getSalesStatementsForPeriod } from '@/lib/api/salesStatements'
import {
  getOrCreateSettlementPeriod,
  type SettlementPeriod,
} from '@/lib/api/settlementPeriods'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

export interface SettlementRegisterRow {
  artistId: string
  artistName: string
  statementId: string | undefined
  statementStatus: string | undefined
  firstViewedAt: string | undefined
  statementAmountEur: number | undefined
  invoiceId: string | undefined
  invoiceStatus: string | undefined
  invoiceNumber: string | undefined
  receivedAt: string | undefined
  paidAt: string | undefined
  paidAmountCents: number
  outstandingAmountCents: number | undefined
  ledgerBalanceEur: number
  carryForwardEur: number | undefined
  openingBalanceEur: number | undefined
}

export interface SettlementRegister {
  period: SettlementPeriod
  rows: SettlementRegisterRow[]
  kpis: {
    approved: number
    viewed: number
    invoiced: number
    received: number
    paid: number
    openBalanceEur: number
  }
}

export async function buildSettlementRegister(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SettlementRegister> {
  const period = await getOrCreateSettlementPeriod(db, periodStart, periodEnd)

  const artistsResult = await db
    .from('artists')
    .select('id, name, organization_id')
    .eq('organization_id', organizationId)
    .order('name')

  let artists: Array<{ id: string; name: string }>
  if (artistsResult.error) {
    const fallback = await db.from('artists').select('id, name').order('name')
    if (fallback.error) throw new Error(fallback.error.message)
    artists = (fallback.data ?? []) as Array<{ id: string; name: string }>
  } else {
    artists = (artistsResult.data ?? []).map((a) => ({ id: a.id, name: a.name }))
  }

  const statements = await getSalesStatementsForPeriod(
    db,
    periodStart,
    periodEnd,
    organizationId,
  )
  const statementByArtist = new Map<string, (typeof statements)[number]>()
  for (const statement of statements) {
    if (!statementByArtist.has(statement.artist_id)) {
      statementByArtist.set(statement.artist_id, statement)
    }
  }

  const invoices = await listInvoicesByStatementIds(
    db,
    statements.map((s) => s.id),
  )
  const invoiceByStatement = new Map(invoices.map((inv) => [inv.statementId, inv]))

  const { data: carryRows } = await db
    .from('period_carry_forwards')
    .select('artist_id, opening_balance_eur')
    .eq('from_period_id', period.id)

  const { data: openingRows } = await db
    .from('period_carry_forwards')
    .select('artist_id, opening_balance_eur')
    .eq('to_period_id', period.id)

  const carryByArtist = new Map(
    (carryRows ?? []).map((row) => [row.artist_id, Number(row.opening_balance_eur)]),
  )
  const openingByArtist = new Map(
    (openingRows ?? []).map((row) => [row.artist_id, Number(row.opening_balance_eur)]),
  )

  const rows: SettlementRegisterRow[] = []
  const artistRows = artists ?? []

  for (const artist of artistRows) {
    const statement = statementByArtist.get(artist.id)
    const invoice = statement ? invoiceByStatement.get(statement.id) : undefined
    const ledgerBalance = await getArtistOutstandingBalance(db, artist.id, period.id)

    rows.push({
      artistId: artist.id,
      artistName: artist.name,
      statementId: statement?.id,
      statementStatus: statement?.status,
      firstViewedAt: statement?.first_viewed_at ?? undefined,
      statementAmountEur: statement?.amount_eur != null ? Number(statement.amount_eur) : undefined,
      invoiceId: invoice?.id,
      invoiceStatus: invoice?.status,
      invoiceNumber: invoice?.artistInvoiceNumber ?? invoice?.invoiceNumber,
      receivedAt: invoice?.receivedAt,
      paidAt: invoice?.paidAt,
      paidAmountCents: invoice?.paidAmountCents ?? 0,
      outstandingAmountCents: invoice?.outstandingAmountCents,
      ledgerBalanceEur: ledgerBalance,
      carryForwardEur: carryByArtist.get(artist.id),
      openingBalanceEur: openingByArtist.get(artist.id),
    })
  }

  const activeRows = rows.filter((row) => row.statementId)
  const openBalanceEur = rows.reduce((sum, r) => sum + r.ledgerBalanceEur, 0)
  const kpis = {
    approved: activeRows.filter((r) =>
      r.statementStatus && ['label_approved', 'artist_notified', 'viewed', 'invoiced', 'paid', 'acknowledged'].includes(r.statementStatus),
    ).length,
    viewed: activeRows.filter((r) => r.firstViewedAt).length,
    invoiced: activeRows.filter((r) => r.invoiceId).length,
    received: activeRows.filter((r) => r.receivedAt).length,
    paid: activeRows.filter((r) => r.paidAt || r.invoiceStatus === 'paid').length,
    openBalanceEur,
  }

  const balanceCheck = reconcileRegisterOpenBalance(
    rows.map((row) => ({ artistId: row.artistId, ledgerBalanceEur: row.ledgerBalanceEur })),
    openBalanceEur,
  )
  if (!balanceCheck.ok) {
    console.warn('[buildSettlementRegister] open balance invariant failed', balanceCheck)
  }

  return { period, rows: rows.filter((r) => r.statementId || r.ledgerBalanceEur !== 0), kpis }
}

export async function computeCarryForwardBalances(
  db: DbClient,
  periodId: string,
): Promise<Array<{ artistId: string; openingBalanceEur: number; breakdown: CarryForwardBreakdown }>> {
  const { data: statements, error } = await db
    .from('sales_statements')
    .select('id, artist_id, amount_eur, status')
    .eq('settlement_period_id', periodId)
    .neq('document_type', 'storno')

  if (error) throw new Error(error.message)

  const results: Array<{
    artistId: string
    openingBalanceEur: number
    breakdown: CarryForwardBreakdown
  }> = []

  const artistIds = [...new Set((statements ?? []).map((s) => s.artist_id))]

  for (const artistId of artistIds) {
    const artistStatements = (statements ?? []).filter((s) => s.artist_id === artistId)
    const statementBalance = artistStatements.reduce((sum, s) => {
      if (['paid', 'invoiced', 'acknowledged'].includes(s.status)) return sum
      return sum + Number(s.amount_eur ?? 0)
    }, 0)

    const ledgerBalance = await getArtistOutstandingBalance(db, artistId, periodId)

    const { data: invoices } = await db
      .from('artist_invoices')
      .select('line_items, paid_amount_cents, outstanding_amount_cents, status, tax_rate_pct')
      .eq('artist_id', artistId)
      .eq('settlement_period_id', periodId)

    let unpaidInvoiceCents = 0
    let partialRemainder = 0
    for (const inv of invoices ?? []) {
      const total = invoiceGrossCents(
        Array.isArray(inv.line_items) ? inv.line_items : [],
        Number(inv.tax_rate_pct ?? 0),
      )
      const paid = Number(inv.paid_amount_cents ?? 0)
      if (inv.status === 'paid') continue
      if (paid > 0) partialRemainder += total - paid
      else unpaidInvoiceCents += total
    }

    const breakdown: CarryForwardBreakdown = {
      statementBalanceEur: ledgerBalance || statementBalance,
      unpaidInvoiceCents,
      partialPaymentRemainderCents: partialRemainder,
    }

    const openingBalanceEur = computeCarryForwardOpeningBalance(breakdown)
    if (Math.abs(openingBalanceEur) >= 0.005) {
      results.push({ artistId, openingBalanceEur, breakdown })
    }
  }

  return results
}

export async function archivePeriodWithCarryForward(
  db: DbClient,
  periodId: string,
  actorId: string,
  nextPeriodStart: string,
  nextPeriodEnd: string,
): Promise<void> {
  const { archiveSettlementPeriod } = await import('@/lib/api/settlementPeriods')
  const { createPeriodCarryForwards, appendLedgerEntry } = await import('@/lib/api/settlementLedger')
  const { getOrCreateSettlementPeriod } = await import('@/lib/api/settlementPeriods')

  const balances = await computeCarryForwardBalances(db, periodId)
  await createPeriodCarryForwards(db, periodId, balances, actorId)

  const nextPeriod = await getOrCreateSettlementPeriod(db, nextPeriodStart, nextPeriodEnd)

  for (const row of balances) {
    await db
      .from('period_carry_forwards')
      .update({ to_period_id: nextPeriod.id })
      .eq('from_period_id', periodId)
      .eq('artist_id', row.artistId)

    await appendLedgerEntry(db, {
      artistId: row.artistId,
      settlementPeriodId: nextPeriod.id,
      entryType: 'carry_in',
      amountEur: row.openingBalanceEur,
      referenceType: 'settlement_period',
      referenceId: periodId,
      description: 'Opening balance from previous period',
      createdBy: actorId,
    })
  }

  await archiveSettlementPeriod(db, periodId, actorId)
}