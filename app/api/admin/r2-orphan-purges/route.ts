/**
 * POST /api/admin/r2-orphan-purges — delete unreferenced R2 objects
 * Body: { confirmation: "DELETE ORPHANS" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { logAdminActionForRequest } from '@/lib/adminAuditLog'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { R2_ORPHAN_PURGE_CONFIRMATION } from '@/lib/r2/constants'
import { confirmationMatches, purgeOrphanObjects } from '@/lib/r2/orphanPurge'
import { createConfiguredR2Client } from '@/lib/r2Utils'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { userId } = await requireAdminFromRequest(request)

  const raw = await request.text()
  if (raw.length > 512) throw new ApiError(413, 'Payload too large')
  let body: { confirmation?: unknown }
  try {
    body = JSON.parse(raw) as { confirmation?: unknown }
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
  if (!confirmationMatches(body.confirmation)) {
    throw new ApiError(400, `confirmation must be exactly "${R2_ORPHAN_PURGE_CONFIRMATION}"`)
  }

  const db = await createServiceRoleSupabaseClient()
  const r2 = await createConfiguredR2Client()
  let result: { deleted: number; skipped: number; remaining: number }
  try {
    result = await purgeOrphanObjects({
      db,
      s3: r2.s3,
      bucket: r2.bucket,
      publicUrl: r2.publicUrl,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Purge failed'
    if (message === 'No completed storage scan') throw new ApiError(409, message)
    throw err
  }

  await logAdminActionForRequest(request, db, {
    actorId: userId,
    action: 'purged',
    resource: 'r2_orphans',
    details: result,
  })

  return NextResponse.json(result)
})
