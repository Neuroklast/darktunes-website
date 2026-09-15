/**
 * Audited purge of Statement of Sales working data (bronze archives + portal gold).
 * Does not touch sales_statements, invoices, or settlement ledger.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export const SOS_PURGE_SCOPES = ['failed_bronze', 'bronze', 'gold'] as const
export type SosPurgeScope = (typeof SOS_PURGE_SCOPES)[number]

export const SOS_PURGE_CONFIRMATION: Record<SosPurgeScope, string> = {
  failed_bronze: 'DELETE FAILED',
  bronze: 'DELETE BRONZE',
  gold: 'DELETE GOLD',
}

export const GOLD_PURGE_TABLES = [
  'artist_territory_metrics',
  'merch_orders',
  'sos_period_summaries',
  'event_impact',
] as const

export type GoldPurgeTable = (typeof GOLD_PURGE_TABLES)[number]

const INCOMPLETE_BRONZE_STATUSES = ['uploaded', 'processing', 'failed'] as const

export interface BronzeBatchRef {
  id: string
  r2Key: string
  status: string
}

export interface SosPurgeCounts {
  bronze_deleted: number
  r2_deleted: number
  r2_failed: number
  gold: Record<GoldPurgeTable, number>
}

export function isSosPurgeScope(value: unknown): value is SosPurgeScope {
  return typeof value === 'string' && (SOS_PURGE_SCOPES as readonly string[]).includes(value)
}

export function confirmationMatches(scope: SosPurgeScope, confirmation: unknown): boolean {
  return typeof confirmation === 'string' && confirmation.trim() === SOS_PURGE_CONFIRMATION[scope]
}

export function emptySosPurgeCounts(): SosPurgeCounts {
  return {
    bronze_deleted: 0,
    r2_deleted: 0,
    r2_failed: 0,
    gold: {
      artist_territory_metrics: 0,
      merch_orders: 0,
      sos_period_summaries: 0,
      event_impact: 0,
    },
  }
}

export async function listBronzeBatchesForPurge(
  db: DbClient,
  scope: Extract<SosPurgeScope, 'failed_bronze' | 'bronze'>,
): Promise<BronzeBatchRef[]> {
  let query = db.from('distributor_import_batches').select('id, r2_key, status')
  if (scope === 'failed_bronze') {
    query = query.in('status', [...INCOMPLETE_BRONZE_STATUSES])
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    r2Key: row.r2_key,
    status: row.status,
  }))
}

export async function deleteBronzeBatchesByIds(db: DbClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  let deleted = 0
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { data, error } = await db
      .from('distributor_import_batches')
      .delete()
      .in('id', chunk)
      .select('id')
    if (error) throw new Error(error.message)
    deleted += (data ?? []).length
  }
  return deleted
}

export async function deleteAllGoldRows(db: DbClient, table: GoldPurgeTable): Promise<number> {
  const { data, error } = await db.from(table).delete().not('id', 'is', null).select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length
}

export async function purgeSosData(
  db: DbClient,
  scope: SosPurgeScope,
  deleteR2Object: (r2Key: string) => Promise<void>,
): Promise<SosPurgeCounts> {
  const counts = emptySosPurgeCounts()

  if (scope === 'failed_bronze' || scope === 'bronze') {
    const batches = await listBronzeBatchesForPurge(db, scope)
    for (const batch of batches) {
      try {
        await deleteR2Object(batch.r2Key)
        counts.r2_deleted += 1
      } catch {
        counts.r2_failed += 1
      }
    }
    counts.bronze_deleted = await deleteBronzeBatchesByIds(
      db,
      batches.map((batch) => batch.id),
    )
  }

  if (scope === 'gold') {
    for (const table of GOLD_PURGE_TABLES) {
      counts.gold[table] = await deleteAllGoldRows(db, table)
    }
  }

  return counts
}
