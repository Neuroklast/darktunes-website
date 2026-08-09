import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { resolveCatalogStorageStats } from '@/lib/assets/storageStats'

export const dynamic = 'force-dynamic'

export interface StorageStatsResponse {
  usedBytes: number
  assetCount: number
  limitBytes: number
  zeroSizeCount: number
  /** Where the total came from (helps diagnose undercount). */
  source: 'rpc' | 'aggregate' | 'paginated'
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
  // Cookie + Bearer (stale Bearer falls through to cookies — see adminAuth)
  const { organizationId } = await requireAdminOrEditorFromRequest(request)

  const supabase = await createServiceRoleSupabaseClient()
  const limitBytes = resolveLimitBytes()
  const stats = await resolveCatalogStorageStats(supabase, organizationId)

  return NextResponse.json(
    {
      usedBytes: stats.usedBytes,
      assetCount: stats.assetCount,
      zeroSizeCount: stats.zeroSizeCount,
      limitBytes,
      source: stats.source,
    } satisfies StorageStatsResponse,
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
})
