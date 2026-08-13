import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { logFinancialEvent } from '@/lib/api/financialAudit'
import { monthToPeriodDate } from '@/lib/sos/lineItemsFromArtistData'

type DbClient = SupabaseClient<Database>
type SettlementPeriodRow = Database['public']['Tables']['settlement_periods']['Row']
type SalesStatementRow = Database['public']['Tables']['sales_statements']['Row']
export type SettlementPeriodStatus = SettlementPeriodRow['status']

export interface SettlementPeriod {
  id: string
  periodStart: string
  periodEnd: string
  label: string
  status: SettlementPeriodStatus
  notes: string | undefined
  lockedAt: string | undefined
  lockedBy: string | undefined
  archivedAt: string | undefined
  archivedBy: string | undefined
  createdAt: string
  updatedAt: string
}

function rowToPeriod(row: SettlementPeriodRow): SettlementPeriod {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    label: row.label,
    status: row.status,
    notes: row.notes ?? undefined,
    lockedAt: row.locked_at ?? undefined,
    lockedBy: row.locked_by ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    archivedBy: row.archived_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildPeriodLabel(periodStart: string, periodEnd: string): string {
  return periodStart === periodEnd ? periodStart : `${periodStart} – ${periodEnd}`
}

/** Accept YYYY-MM (bronze/SOS UI) or YYYY-MM-DD (settlement register) for DATE columns. */
export function normalizeSettlementPeriodDate(value: string, endOfMonth = false): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const converted = monthToPeriodDate(value, endOfMonth)
  if (converted) return converted
  throw new Error(`Invalid settlement period date: ${value}`)
}

export function normalizeSettlementPeriodBounds(
  periodStart: string,
  periodEnd: string,
): { periodStart: string; periodEnd: string } {
  return {
    periodStart: normalizeSettlementPeriodDate(periodStart, false),
    periodEnd: normalizeSettlementPeriodDate(periodEnd, true),
  }
}

export async function listSettlementPeriods(db: DbClient): Promise<SettlementPeriod[]> {
  const { data, error } = await db
    .from('settlement_periods')
    .select('*')
    .order('period_start', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToPeriod(row as SettlementPeriodRow))
}

export async function getSettlementPeriodById(
  db: DbClient,
  id: string,
): Promise<SettlementPeriod | null> {
  const { data, error } = await db.from('settlement_periods').select('*').eq('id', id).single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data ? rowToPeriod(data as SettlementPeriodRow) : null
}

export async function getSettlementPeriodByDates(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
): Promise<SettlementPeriod | null> {
  const bounds = normalizeSettlementPeriodBounds(periodStart, periodEnd)
  const { data, error } = await db
    .from('settlement_periods')
    .select('*')
    .eq('period_start', bounds.periodStart)
    .eq('period_end', bounds.periodEnd)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? rowToPeriod(data as SettlementPeriodRow) : null
}

export async function getOrCreateSettlementPeriod(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
): Promise<SettlementPeriod> {
  const bounds = normalizeSettlementPeriodBounds(periodStart, periodEnd)
  const existing = await getSettlementPeriodByDates(db, bounds.periodStart, bounds.periodEnd)
  if (existing) return existing

  const label = buildPeriodLabel(bounds.periodStart, bounds.periodEnd)
  const { data, error } = await db
    .from('settlement_periods')
    .insert({
      period_start: bounds.periodStart,
      period_end: bounds.periodEnd,
      label,
      status: 'open',
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return rowToPeriod(data as SettlementPeriodRow)
}

export async function lockSettlementPeriod(
  db: DbClient,
  id: string,
  actorId: string,
): Promise<SettlementPeriod> {
  const existing = await getSettlementPeriodById(db, id)
  if (!existing) throw new Error('Settlement period not found')
  if (existing.status === 'archived') throw new Error('Archived periods cannot be locked')
  if (existing.status === 'locked') return existing

  const now = new Date().toISOString()
  const { data, error } = await db
    .from('settlement_periods')
    .update({
      status: 'locked',
      locked_at: now,
      locked_by: actorId,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  await logFinancialEvent(db, {
    entityType: 'settlement_period',
    entityId: id,
    action: 'lock',
    actorId,
    beforeData: { status: existing.status },
    afterData: { status: 'locked', locked_at: now },
  })

  return rowToPeriod(data as SettlementPeriodRow)
}

export async function archiveSettlementPeriod(
  db: DbClient,
  id: string,
  actorId: string,
): Promise<SettlementPeriod> {
  const existing = await getSettlementPeriodById(db, id)
  if (!existing) throw new Error('Settlement period not found')
  if (existing.status === 'archived') return existing

  const now = new Date().toISOString()
  const { data, error } = await db
    .from('settlement_periods')
    .update({
      status: 'archived',
      archived_at: now,
      archived_by: actorId,
      locked_at: existing.lockedAt ?? now,
      locked_by: existing.lockedBy ?? actorId,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)

  await db
    .from('sales_statements')
    .update({ is_archived: true })
    .eq('settlement_period_id', id)

  await logFinancialEvent(db, {
    entityType: 'settlement_period',
    entityId: id,
    action: 'archive',
    actorId,
    beforeData: { status: existing.status },
    afterData: { status: 'archived', archived_at: now },
  })

  return rowToPeriod(data as SettlementPeriodRow)
}

export function isPeriodWritable(status: SettlementPeriodStatus): boolean {
  return status === 'open' || status === 'under_review' || status === 'approved'
}

export class SettlementPeriodNotWritableError extends Error {
  constructor(public readonly periodStatus: SettlementPeriodStatus) {
    super(`Settlement period is ${periodStatus} and cannot be modified`)
    this.name = 'SettlementPeriodNotWritableError'
  }
}

function assertWritableStatus(status: SettlementPeriodStatus): void {
  if (!isPeriodWritable(status)) {
    throw new SettlementPeriodNotWritableError(status)
  }
}

export async function assertSettlementPeriodWritable(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const bounds = normalizeSettlementPeriodBounds(periodStart, periodEnd)

  const { data, error } = await db
    .from('settlement_periods')
    .select('status')
    .eq('period_start', bounds.periodStart)
    .eq('period_end', bounds.periodEnd)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return

  assertWritableStatus((data as Pick<SettlementPeriodRow, 'status'>).status)
}

export async function assertSettlementPeriodWritableById(
  db: DbClient,
  periodId: string,
): Promise<void> {
  const period = await getSettlementPeriodById(db, periodId)
  if (!period) return
  assertWritableStatus(period.status)
}

export async function assertStatementPeriodWritable(
  db: DbClient,
  statementId: string,
): Promise<void> {
  const { data, error } = await db
    .from('sales_statements')
    .select('settlement_period_id, period_start, period_end')
    .eq('id', statementId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') throw new Error('Statement not found')
    throw new Error(error.message)
  }

  const row = data as Pick<
    SalesStatementRow,
    'settlement_period_id' | 'period_start' | 'period_end'
  >

  if (row.settlement_period_id) {
    await assertSettlementPeriodWritableById(db, row.settlement_period_id)
    return
  }

  if (row.period_start && row.period_end) {
    await assertSettlementPeriodWritable(db, row.period_start, row.period_end)
  }
}