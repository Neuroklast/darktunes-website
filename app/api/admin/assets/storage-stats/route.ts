import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { resolveCatalogStorageStats } from '@/lib/assets/storageStats'
import { getLatestStorageSnapshot } from '@/lib/r2/storageScan'

export const dynamic = 'force-dynamic'

export interface StorageStatsResponse {
  used_bytes: number
  catalog_used_bytes: number
  asset_count: number
  limit_bytes: number
  zero_size_count: number
  object_count: number | null
  orphan_bytes: number | null
  orphan_count: number | null
  scanned_at: string | null
  source: 'bucket' | 'rpc' | 'aggregate' | 'paginated'
}

const DEFAULT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

function resolveLimitBytes(): number {
  const raw =
    process.env.NEXT_PUBLIC_R2_STORAGE_LIMIT_BYTES ?? process.env.R2_STORAGE_LIMIT_BYTES
  if (!raw) return DEFAULT_LIMIT_BYTES
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_BYTES
}

export const GET = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  await requireAdminOrEditorFromRequest(request)

  const supabase = await createServiceRoleSupabaseClient()
  const limitBytes = resolveLimitBytes()
  const stats = await resolveCatalogStorageStats(supabase)
  const snapshot = await getLatestStorageSnapshot(supabase)
  const completed = snapshot && snapshot.status === 'completed' ? snapshot : null
  const usedBytes = completed ? completed.used_bytes : stats.usedBytes

  return NextResponse.json(
    {
      used_bytes: usedBytes,
      catalog_used_bytes: stats.usedBytes,
      asset_count: stats.assetCount,
      zero_size_count: stats.zeroSizeCount,
      object_count: completed ? completed.object_count : null,
      orphan_bytes: completed ? completed.orphan_bytes : null,
      orphan_count: completed ? completed.orphan_count : null,
      scanned_at: completed ? completed.scanned_at : null,
      limit_bytes: limitBytes,
      source: completed ? 'bucket' : stats.source,
    } satisfies StorageStatsResponse,
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
})
