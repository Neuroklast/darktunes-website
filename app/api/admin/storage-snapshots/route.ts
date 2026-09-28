/**
 * GET /api/admin/storage-snapshots — latest R2 bucket usage snapshot
 * POST /api/admin/storage-snapshots — scan the bucket (admin). Body: { cursor? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest, requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { logAdminActionForRequest } from '@/lib/adminAuditLog'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createConfiguredR2Client } from '@/lib/r2Utils'
import { getLatestStorageSnapshot, runStorageScan, snapshotToResponse } from '@/lib/r2/storageScan'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  await requireAdminOrEditorFromRequest(request)
  const db = await createServiceRoleSupabaseClient()
  const snapshot = await getLatestStorageSnapshot(db)
  if (!snapshot) {
    return NextResponse.json({ snapshot: null }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
  return NextResponse.json(
    { snapshot: snapshotToResponse(snapshot) },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
})

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { userId } = await requireAdminFromRequest(request)
  const db = await createServiceRoleSupabaseClient()
  const r2 = await createConfiguredR2Client()

  let cursor: string | null = null
  const raw = await request.text()
  if (raw.trim()) {
    let body: { cursor?: unknown }
    try {
      body = JSON.parse(raw) as { cursor?: unknown }
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }
    if (body.cursor != null && typeof body.cursor !== 'string') {
      throw new ApiError(400, 'cursor must be a string')
    }
    cursor = typeof body.cursor === 'string' && body.cursor.trim() ? body.cursor : null
  }

  const result = await runStorageScan({
    db,
    s3: r2.s3,
    bucket: r2.bucket,
    publicUrl: r2.publicUrl,
    actorId: userId,
    cursor,
  })

  await logAdminActionForRequest(request, db, {
    actorId: userId,
    action: result.truncated ? 'scanned' : 'completed',
    resource: 'r2_storage',
    resourceId: result.snapshot.id,
    details: {
      used_bytes: result.snapshot.used_bytes,
      object_count: result.snapshot.object_count,
      orphan_count: result.snapshot.orphan_count,
      multipart_aborted_count: result.snapshot.multipart_aborted_count,
      truncated: result.truncated,
    },
  })

  const payload = { snapshot: snapshotToResponse(result.snapshot) }
  return NextResponse.json(payload, {
    status: result.truncated ? 202 : 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
})
