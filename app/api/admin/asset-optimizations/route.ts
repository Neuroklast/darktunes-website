/**
 * POST /api/admin/asset-optimizations — recompress catalog images in place
 * Body: { cursor? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { logAdminActionForRequest } from '@/lib/adminAuditLog'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { optimizeCatalogAssets } from '@/lib/images/optimizeAssets'
import { ASSET_OPTIMIZE_IDS_MAX } from '@/lib/r2/constants'
import { createConfiguredR2Client } from '@/lib/r2Utils'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { userId } = await requireAdminOrEditorFromRequest(request)
  const db = await createServiceRoleSupabaseClient()
  const r2 = await createConfiguredR2Client()

  let cursor: string | null = null
  let assetIds: string[] | undefined
  const raw = await request.text()
  if (raw.trim()) {
    let body: { cursor?: unknown; asset_ids?: unknown }
    try {
      body = JSON.parse(raw) as { cursor?: unknown; asset_ids?: unknown }
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }
    if (body.cursor != null && typeof body.cursor !== 'string') {
      throw new ApiError(400, 'cursor must be a string')
    }
    cursor = typeof body.cursor === 'string' && body.cursor.trim() ? body.cursor : null
    if (body.asset_ids != null) {
      if (!Array.isArray(body.asset_ids)) throw new ApiError(400, 'asset_ids must be an array')
      if (body.asset_ids.length === 0) throw new ApiError(400, 'asset_ids must not be empty')
      if (body.asset_ids.length > ASSET_OPTIMIZE_IDS_MAX) {
        throw new ApiError(400, `asset_ids max is ${ASSET_OPTIMIZE_IDS_MAX}`)
      }
      if (!body.asset_ids.every((id): id is string => typeof id === 'string' && id.length > 0)) {
        throw new ApiError(400, 'asset_ids must be strings')
      }
      assetIds = body.asset_ids
    }
  }

  const result = await optimizeCatalogAssets({
    db,
    s3: r2.s3,
    bucket: r2.bucket,
    cursor: assetIds ? null : cursor,
    assetIds,
  })

  await logAdminActionForRequest(request, db, {
    actorId: userId,
    action: 'optimized',
    resource: 'assets',
    details: { ...result },
  })

  return NextResponse.json(result, { status: result.truncated ? 202 : 200 })
})
