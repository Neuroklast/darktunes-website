/**
 * Catalog storage totals for Admin → Assets explorer bar.
 * Prefer server-side aggregation (no PostgREST 1000-row cap).
 * Scoped by organization_id so each label only sees its own catalog usage.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import type { Database } from '@/types/database'

export type StorageStatsSource = 'rpc' | 'aggregate' | 'paginated'

export interface CatalogStorageStats {
  usedBytes: number
  assetCount: number
  source: StorageStatsSource
  /** Rows with size_bytes = 0 (catalog may under-report vs R2 until backfilled). */
  zeroSizeCount: number
}

export function coerceNonNegInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n))
  }
  if (typeof value === 'bigint') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n))
  }
  return 0
}

/**
 * Parse RPC payload for get_assets_storage_stats.
 * Supports: JSON object, single-element array, snake_case / camelCase keys.
 */
export function parseRpcStats(rpcData: unknown): {
  usedBytes: number
  assetCount: number
  zeroSizeCount: number
} | null {
  if (rpcData == null) return null

  let row: unknown = rpcData
  if (Array.isArray(rpcData)) {
    if (rpcData.length === 0) return null
    row = rpcData[0]
  }
  // json-returning functions may double-encode as string
  if (typeof row === 'string') {
    try {
      row = JSON.parse(row) as unknown
    } catch {
      return null
    }
  }
  if (!row || typeof row !== 'object') return null

  const record = row as Record<string, unknown>
  if (!('used_bytes' in record) && !('usedBytes' in record)) return null

  return {
    usedBytes: coerceNonNegInt(record.used_bytes ?? record.usedBytes),
    assetCount: coerceNonNegInt(record.asset_count ?? record.assetCount),
    zeroSizeCount: coerceNonNegInt(record.zero_size_count ?? record.zeroSizeCount),
  }
}

/** Parse PostgREST aggregate: size_bytes.sum() → { sum } */
export function parseAggregateSum(data: unknown): number | null {
  if (data == null) return null
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  // PostgREST names the key `sum` for size_bytes.sum()
  if ('sum' in record) return coerceNonNegInt(record.sum)
  if ('size_bytes' in record) return coerceNonNegInt(record.size_bytes)
  return null
}

type ServiceDb = SupabaseClient<Database>

async function tryRpc(
  db: ServiceDb,
  organizationId: string,
): Promise<CatalogStorageStats | null> {
  const { data, error } = await db.rpc('get_assets_storage_stats', {
    p_organization_id: organizationId,
  })
  if (error) return null
  const parsed = parseRpcStats(data)
  if (!parsed) return null
  return {
    usedBytes: parsed.usedBytes,
    assetCount: parsed.assetCount,
    zeroSizeCount: parsed.zeroSizeCount,
    source: 'rpc',
  }
}

async function tryAggregate(
  db: ServiceDb,
  organizationId: string,
): Promise<CatalogStorageStats | null> {
  // Single-row aggregate — no 1000-row cap
  const sumResult = await db
    .from('assets')
    .select('size_bytes.sum()')
    .eq('organization_id', organizationId)
  if (sumResult.error) return null
  const usedBytes = parseAggregateSum(sumResult.data)
  if (usedBytes === null) return null

  const countResult = await db
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
  if (countResult.error) return null
  const assetCount = countResult.count ?? 0

  // Optional zero-size diagnostic (best-effort; ignore failures)
  let zeroSizeCount = 0
  const zeroResult = await db
    .from('assets')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('size_bytes', 0)
  if (!zeroResult.error && typeof zeroResult.count === 'number') {
    zeroSizeCount = zeroResult.count
  }

  return {
    usedBytes,
    assetCount,
    zeroSizeCount,
    source: 'aggregate',
  }
}

/**
 * Last-resort page through size_bytes. Must order by stable key for range pagination.
 */
export async function sumSizeBytesPaginated(
  db: ServiceDb,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<CatalogStorageStats> {
  const pageSize = 1000
  let usedBytes = 0
  let assetCount = 0
  let zeroSizeCount = 0
  let from = 0

  for (;;) {
    const { data, error } = await db
      .from('assets')
      .select('size_bytes')
      .eq('organization_id', organizationId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    const rows = data ?? []
    assetCount += rows.length
    for (const row of rows) {
      const n = coerceNonNegInt(row.size_bytes)
      usedBytes += n
      if (n === 0) zeroSizeCount += 1
    }
    if (rows.length < pageSize) break
    from += pageSize
  }

  return { usedBytes, assetCount, zeroSizeCount, source: 'paginated' }
}

/**
 * Resolve catalog storage with multi-strategy fallback:
 * RPC → PostgREST aggregate → paginated sum.
 * Always scoped to one organization.
 */
export async function resolveCatalogStorageStats(
  db: ServiceDb,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<CatalogStorageStats> {
  const fromRpc = await tryRpc(db, organizationId)
  if (fromRpc) return fromRpc

  const fromAgg = await tryAggregate(db, organizationId)
  if (fromAgg) return fromAgg

  return sumSizeBytesPaginated(db, organizationId)
}
