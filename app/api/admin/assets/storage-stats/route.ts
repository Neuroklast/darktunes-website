import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export interface StorageStatsResponse {
  usedBytes: number
  assetCount: number
  limitBytes: number
  /** Where the total came from (helps diagnose undercount). */
  source: 'rpc' | 'paginated'
}

const DEFAULT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

function resolveLimitBytes(): number {
  const raw =
    process.env.NEXT_PUBLIC_R2_STORAGE_LIMIT_BYTES ?? process.env.R2_STORAGE_LIMIT_BYTES
  if (!raw) return DEFAULT_LIMIT_BYTES
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_BYTES
}

function coerceNonNegInt(value: unknown): number {
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

function parseRpcStats(rpcData: unknown): { usedBytes: number; assetCount: number } | null {
  if (rpcData == null) return null

  // PostgREST may return: row object, single-element array, or { used_bytes, asset_count }
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
  if (!row || typeof row !== 'object') return null

  const record = row as Record<string, unknown>
  // Support snake_case (SQL) and accidental camelCase
  if (!('used_bytes' in record) && !('usedBytes' in record)) return null

  return {
    usedBytes: coerceNonNegInt(record.used_bytes ?? record.usedBytes),
    assetCount: coerceNonNegInt(record.asset_count ?? record.assetCount),
  }
}

/**
 * Fallback when the RPC is missing or returns an unexpected shape.
 * PostgREST defaults to max 1000 rows per request — must page.
 */
async function sumSizeBytesPaginated(
  supabase: Awaited<ReturnType<typeof createServiceRoleSupabaseClient>>,
): Promise<{ usedBytes: number; assetCount: number }> {
  const pageSize = 1000
  let usedBytes = 0
  let assetCount = 0
  let from = 0

  for (;;) {
    const { data, error } = await supabase
      .from('assets')
      .select('size_bytes')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    const rows = data ?? []
    assetCount += rows.length
    for (const row of rows) {
      usedBytes += coerceNonNegInt(row.size_bytes)
    }
    if (rows.length < pageSize) break
    from += pageSize
  }

  return { usedBytes, assetCount }
}

export const GET = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  // Cookie + Bearer — admin UI often relies on session cookies when token is still loading.
  await requireAdminOrEditorFromRequest(request)

  const supabase = await createServiceRoleSupabaseClient()
  const limitBytes = resolveLimitBytes()

  const { data: rpcData, error: rpcError } = await supabase.rpc('get_assets_storage_stats')

  if (!rpcError) {
    const parsed = parseRpcStats(rpcData)
    if (parsed) {
      return NextResponse.json({
        usedBytes: parsed.usedBytes,
        assetCount: parsed.assetCount,
        limitBytes,
        source: 'rpc',
      } satisfies StorageStatsResponse)
    }
  } else {
    console.warn('[storage-stats] RPC unavailable, using paginated sum:', rpcError.message)
  }

  const { usedBytes, assetCount } = await sumSizeBytesPaginated(supabase)
  return NextResponse.json({
    usedBytes,
    assetCount,
    limitBytes,
    source: 'paginated',
  } satisfies StorageStatsResponse)
})
