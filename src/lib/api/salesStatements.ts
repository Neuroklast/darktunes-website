import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { appendLedgerEntry, hasLedgerEntry } from '@/lib/api/settlementLedger'
import { getOrCreateSettlementPeriod } from '@/lib/api/settlementPeriods'
import { assertStatementTransition } from '@/lib/sos/statementStatusTransitions'
import { PUBLIC_QUERY_LIMITS } from './queryLimits'

type DbClient = SupabaseClient<Database>
type SalesStatementRow = Database['public']['Tables']['sales_statements']['Row']
export type SalesStatementStatus = SalesStatementRow['status']

export type SalesStatementDocumentType = SalesStatementRow['document_type']

export interface SalesStatement {
  id: string
  artistId: string
  filename: string
  r2Key: string
  period: string
  periodStart: string | undefined
  periodEnd: string | undefined
  amountEur: number | undefined
  status: SalesStatementStatus
  labelNotes: string | undefined
  labelApprovedAt: string | undefined
  firstViewedAt: string | undefined
  lastViewedAt: string | undefined
  viewCount: number
  settlementPeriodId: string | undefined
  documentType: SalesStatementDocumentType
  correctionOfId: string | undefined
  isArchived: boolean
  /** Linked bronze distributor CSV batch (chain of custody). */
  batchId: string | undefined
  createdAt: string
}

export interface CreateSalesStatementData {
  artistId: string
  filename: string
  r2Key: string
  period: string
  amountEur?: number | null
  periodStart?: string | null
  periodEnd?: string | null
  totalStreams?: number | null
  batchId?: string | null
}

export class DuplicateDraftStatementError extends Error {
  constructor() {
    super('A draft statement already exists for this artist and period')
    this.name = 'DuplicateDraftStatementError'
  }
}

export class StatementNotDeletableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StatementNotDeletableError'
  }
}

/** Statuses visible to portal artists (drafts and superseded are admin-only). */
export const ARTIST_VISIBLE_STATEMENT_STATUSES: SalesStatementStatus[] = [
  'label_approved',
  'artist_notified',
  'viewed',
  'invoiced',
  'paid',
  'acknowledged',
]

async function assertNoDuplicateDraft(
  db: DbClient,
  artistId: string,
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
): Promise<void> {
  if (!periodStart || !periodEnd) return

  const { data, error } = await db
    .from('sales_statements')
    .select('id')
    .eq('artist_id', artistId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .eq('status', 'draft')
    .neq('document_type', 'storno')
    .limit(1)

  if (error) throw new Error(error.message)
  if (data && data.length > 0) throw new DuplicateDraftStatementError()
}

function rowToSalesStatement(row: SalesStatementRow): SalesStatement {
  return {
    id: row.id,
    artistId: row.artist_id,
    filename: row.filename,
    r2Key: row.r2_key,
    period: row.period,
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    amountEur: row.amount_eur ?? undefined,
    status: row.status,
    labelNotes: row.label_notes ?? undefined,
    labelApprovedAt: row.label_approved_at ?? undefined,
    firstViewedAt: row.first_viewed_at ?? undefined,
    lastViewedAt: row.last_viewed_at ?? undefined,
    viewCount: row.view_count ?? 0,
    settlementPeriodId: row.settlement_period_id ?? undefined,
    documentType: row.document_type ?? 'original',
    correctionOfId: row.correction_of_id ?? undefined,
    isArchived: row.is_archived ?? false,
    batchId: row.batch_id ?? undefined,
    createdAt: row.created_at,
  }
}

export async function createSalesStatement(
  db: DbClient,
  data: CreateSalesStatementData,
): Promise<SalesStatement> {
  await assertNoDuplicateDraft(db, data.artistId, data.periodStart, data.periodEnd)

  const { data: row, error } = await db
    .from('sales_statements')
    .insert({
      artist_id: data.artistId,
      filename: data.filename,
      r2_key: data.r2Key,
      period: data.period,
      amount_eur: data.amountEur ?? null,
      period_start: data.periodStart ?? null,
      period_end: data.periodEnd ?? null,
      total_streams: data.totalStreams ?? 0,
      batch_id: data.batchId ?? null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') throw new DuplicateDraftStatementError()
    throw new Error(error.message)
  }
  if (!row) throw new Error('No data returned from createSalesStatement')
  return rowToSalesStatement(row as SalesStatementRow)
}

export async function getSalesStatementsByArtistId(
  db: DbClient,
  artistId: string,
): Promise<SalesStatement[]> {
  const { data, error } = await db
    .from('sales_statements')
    .select('*')
    .eq('artist_id', artistId)
    .in('status', ARTIST_VISIBLE_STATEMENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(PUBLIC_QUERY_LIMITS.statementsByArtist)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToSalesStatement(row as SalesStatementRow))
}

export async function getSalesStatementById(
  db: DbClient,
  id: string,
  artistId?: string,
): Promise<SalesStatement | null> {
  let query = db.from('sales_statements').select('*').eq('id', id)

  if (artistId) {
    query = query.eq('artist_id', artistId)
  }

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data ? rowToSalesStatement(data as SalesStatementRow) : null
}

export async function approveSalesStatement(
  db: DbClient,
  id: string,
  notes?: string,
): Promise<SalesStatement> {
  const { data: existing, error: fetchError } = await db
    .from('sales_statements')
    .select('status')
    .eq('id', id)
    .single()

  if (fetchError) throw new Error(fetchError.message)
  if (!existing) throw new Error('Statement not found')
  if (existing.status !== 'draft') {
    throw new Error(`Cannot approve statement in status "${existing.status}"`)
  }

  const { data: row, error } = await db
    .from('sales_statements')
    .update({
      status: 'label_approved',
      label_notes: notes?.trim() ? notes.trim() : null,
      label_approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  if (!row) throw new Error('Cannot approve statement in status "draft" (concurrent update)')
  return rowToSalesStatement(row as SalesStatementRow)
}

export interface ApproveSalesStatementResult {
  statement: SalesStatement
  emailSent: boolean
  emailError?: string
}

export async function approveAndNotifySalesStatement(
  db: DbClient,
  id: string,
  notify: (statement: SalesStatement) => Promise<{ success: boolean; error?: string }>,
  notes?: string,
): Promise<ApproveSalesStatementResult> {
  const approved = await approveSalesStatement(db, id, notes)
  const emailResult = await notify(approved)

  if (emailResult.success) {
    const notified = await updateSalesStatementStatus(db, id, 'artist_notified')
    return { statement: notified, emailSent: true }
  }

  return {
    statement: approved,
    emailSent: false,
    emailError: emailResult.error,
  }
}

export async function updateSalesStatementStatus(
  db: DbClient,
  id: string,
  status: SalesStatementStatus,
): Promise<SalesStatement> {
  const existing = await getSalesStatementById(db, id)
  if (!existing) throw new Error('Statement not found')
  if (existing.status === status) return existing
  assertStatementTransition(existing.status, status)

  const { data: row, error } = await db
    .from('sales_statements')
    .update({ status })
    .eq('id', id)
    .eq('status', existing.status)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  if (!row) throw new Error(`Cannot change statement status from "${existing.status}" (concurrent update)`)
  return rowToSalesStatement(row as SalesStatementRow)
}

export async function getSalesSummariesForAdmin(
  db: DbClient,
  status?: SalesStatementStatus,
): Promise<SalesStatement[]> {
  let query = db.from('sales_statements').select('*').order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToSalesStatement(row as SalesStatementRow))
}

export async function getSalesStatementsForPeriod(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
): Promise<SalesStatementRow[]> {
  const { data, error } = await db
    .from('sales_statements')
    .select('*')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .neq('document_type', 'storno')
    .neq('status', 'superseded')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as SalesStatementRow[]
}

const DELETABLE_STATEMENT_STATUSES: SalesStatementStatus[] = ['draft', 'cancelled']

export async function deleteSalesStatementDraft(
  db: DbClient,
  id: string,
): Promise<SalesStatement> {
  const { data: row, error: fetchError } = await db
    .from('sales_statements')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError) throw new Error(fetchError.message)
  if (!row) throw new StatementNotDeletableError('Statement not found')

  const statement = row as SalesStatementRow
  if (!DELETABLE_STATEMENT_STATUSES.includes(statement.status)) {
    throw new StatementNotDeletableError(
      `Only draft or cancelled statements can be deleted (current: "${statement.status}")`,
    )
  }
  if (statement.document_type === 'correction') {
    throw new StatementNotDeletableError('Correction statements cannot be deleted; use supersede flow')
  }

  const { data: ledgerRows, error: ledgerError } = await db
    .from('artist_settlement_ledger')
    .select('id')
    .eq('reference_type', 'sales_statement')
    .eq('reference_id', id)
    .limit(1)

  if (ledgerError) throw new Error(ledgerError.message)
  if (ledgerRows && ledgerRows.length > 0) {
    throw new StatementNotDeletableError('Statement has ledger entries and cannot be deleted')
  }

  const { error: lineItemsError } = await db
    .from('sales_statement_line_items')
    .delete()
    .eq('statement_id', id)

  if (lineItemsError) throw new Error(lineItemsError.message)

  const { error: deleteError } = await db.from('sales_statements').delete().eq('id', id)

  if (deleteError) throw new Error(deleteError.message)

  return rowToSalesStatement(statement)
}

export async function linkApprovedStatementToSettlement(
  db: DbClient,
  statement: SalesStatement,
  actorId: string,
): Promise<void> {
  if (statement.amountEur == null || !statement.periodStart || !statement.periodEnd) return

  // Idempotent: re-approve / retry must not double-book.
  if (await hasLedgerEntry(db, 'sales_statement', statement.id)) {
    return
  }

  const period = await getOrCreateSettlementPeriod(db, statement.periodStart, statement.periodEnd)

  await db
    .from('sales_statements')
    .update({ settlement_period_id: period.id })
    .eq('id', statement.id)

  // Correction approve: supersede original + book delta (not a full second payout).
  if (statement.documentType === 'correction' && statement.correctionOfId) {
    const { data: original, error } = await db
      .from('sales_statements')
      .select('amount_eur, settlement_period_id, status')
      .eq('id', statement.correctionOfId)
      .single()

    if (error) throw new Error(error.message)

    if (original && original.status !== 'superseded') {
      assertStatementTransition(original.status, 'superseded')
      const { error: supersedeError } = await db
        .from('sales_statements')
        .update({
          status: 'superseded',
          superseded_by_id: statement.id,
        })
        .eq('id', statement.correctionOfId)

      if (supersedeError) throw new Error(supersedeError.message)
    }

    const originalOnLedger =
      original?.settlement_period_id != null ||
      (await hasLedgerEntry(db, 'sales_statement', statement.correctionOfId))

    if (originalOnLedger) {
      const originalAmount = Number(original?.amount_eur ?? 0)
      const delta = statement.amountEur - originalAmount
      if (Math.abs(delta) >= 0.005) {
        await appendLedgerEntry(db, {
          artistId: statement.artistId,
          settlementPeriodId: period.id,
          entryType: 'correction',
          amountEur: delta,
          referenceType: 'sales_statement',
          referenceId: statement.id,
          description: `Statement correction ${statement.period}`,
          createdBy: actorId,
        })
      }
      return
    }
  }

  await appendLedgerEntry(db, {
    artistId: statement.artistId,
    settlementPeriodId: period.id,
    entryType: 'statement_payout',
    amountEur: statement.amountEur,
    referenceType: 'sales_statement',
    referenceId: statement.id,
    description: `Statement payout ${statement.period}`,
    createdBy: actorId,
  })
}

const CORRECTABLE_STATUSES: SalesStatementStatus[] = [
  'label_approved',
  'artist_notified',
  'viewed',
  'invoiced',
  'acknowledged',
]

export interface CreateCorrectionStatementInput {
  amountEur: number
  r2Key: string
  labelNotes?: string
}

export async function createCorrectionStatement(
  db: DbClient,
  originalId: string,
  input: CreateCorrectionStatementInput,
  actorId: string,
): Promise<SalesStatement> {
  const { data: original, error: fetchError } = await db
    .from('sales_statements')
    .select('*')
    .eq('id', originalId)
    .single()

  if (fetchError) throw new Error(fetchError.message)
  if (!original) throw new Error('Statement not found')

  const originalRow = original as SalesStatementRow
  if (!CORRECTABLE_STATUSES.includes(originalRow.status)) {
    throw new Error(`Cannot correct statement in status "${originalRow.status}"`)
  }
  if (originalRow.document_type === 'storno') {
    throw new Error('Cannot correct a storno document')
  }

  const { data: correctionRow, error: insertError } = await db
    .from('sales_statements')
    .insert({
      artist_id: originalRow.artist_id,
      filename: originalRow.filename.replace(/\.pdf$/i, '') + '-Korrektur.pdf',
      r2_key: input.r2Key,
      period: originalRow.period,
      amount_eur: input.amountEur,
      status: 'draft',
      label_notes: input.labelNotes?.trim() || null,
      period_start: originalRow.period_start,
      period_end: originalRow.period_end,
      total_streams: originalRow.total_streams,
      batch_id: originalRow.batch_id,
      document_type: 'correction',
      correction_of_id: originalId,
      version: (originalRow.version ?? 1) + 1,
      reporting_currency: originalRow.reporting_currency,
      amount_reporting: originalRow.amount_reporting,
      fx_rate_to_eur: originalRow.fx_rate_to_eur,
      fx_rate_date: originalRow.fx_rate_date,
      fx_source: originalRow.fx_source,
      settlement_period_id: originalRow.settlement_period_id,
    })
    .select('*')
    .single()

  if (insertError) throw new Error(insertError.message)

  // Original stays visible until the correction is approved (see linkApprovedStatementToSettlement).
  // actorId reserved for approve-time ledger attribution.
  void actorId

  return rowToSalesStatement(correctionRow as SalesStatementRow)
}

export async function recordStatementView(
  db: DbClient,
  id: string,
  artistId: string,
): Promise<SalesStatement> {
  const existing = await getSalesStatementById(db, id, artistId)
  if (!existing) throw new Error('Statement not found')

  const now = new Date().toISOString()
  const nextStatus =
    existing.status === 'artist_notified' || existing.status === 'label_approved'
      ? 'viewed'
      : existing.status

  const { data, error } = await db
    .from('sales_statements')
    .update({
      first_viewed_at: existing.firstViewedAt ?? now,
      last_viewed_at: now,
      view_count: (existing.viewCount ?? 0) + 1,
      status: nextStatus,
    })
    .eq('id', id)
    .eq('artist_id', artistId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return rowToSalesStatement(data as SalesStatementRow)
}
