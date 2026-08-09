/**
 * DAL for sos_period_summaries — Sales Statement period revenue trend snapshots
 * with Bronze lineage. Scoped by organization_id (table name keeps legacy sos_* path).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['sos_period_summaries']['Row']

export interface SosPeriodSummary {
  id: string
  periodStart: string
  periodEnd: string
  totalRevenue: number
  totalPayout: number
  artistCount: number
  artistBreakdowns: unknown[]
  platformBreakdowns: unknown[]
  sourceBatchIds: string[]
  createdAt: string
}

export interface UpsertSosPeriodSummaryInput {
  periodStart: string
  periodEnd: string
  totalRevenue: number
  totalPayout: number
  artistCount: number
  artistBreakdowns: unknown[]
  platformBreakdowns: unknown[]
  sourceBatchIds?: string[]
  organizationId?: string
}

function rowToSummary(row: Row): SosPeriodSummary {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalRevenue: Number(row.total_revenue),
    totalPayout: Number(row.total_payout),
    artistCount: row.artist_count,
    artistBreakdowns: row.artist_breakdowns as unknown[],
    platformBreakdowns: row.platform_breakdowns as unknown[],
    sourceBatchIds: row.source_batch_ids ?? [],
    createdAt: row.created_at,
  }
}

export async function upsertSosPeriodSummary(
  db: DbClient,
  input: UpsertSosPeriodSummaryInput,
): Promise<SosPeriodSummary> {
  const organizationId = input.organizationId ?? DEFAULT_ORGANIZATION_ID
  const { data, error } = await db
    .from('sos_period_summaries')
    .upsert(
      {
        organization_id: organizationId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        total_revenue: input.totalRevenue,
        total_payout: input.totalPayout,
        artist_count: input.artistCount,
        artist_breakdowns: input.artistBreakdowns,
        platform_breakdowns: input.platformBreakdowns,
        source_batch_ids: input.sourceBatchIds ?? [],
      },
      { onConflict: 'organization_id,period_start,period_end' },
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToSummary(data)
}

export async function listSosPeriodSummaries(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosPeriodSummary[]> {
  const { data, error } = await db
    .from('sos_period_summaries')
    .select('*')
    .eq('organization_id', organizationId)
    .order('period_start', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToSummary(row as Row))
}
