/**
 * POST /api/admin/maintenance/purge-sos-data
 *
 * Audited purge of Statement of Sales working data.
 * Body: { scope: 'failed_bronze' | 'bronze' | 'gold', confirmation: string }
 * Does not delete sales_statements, invoices, or settlement ledger.
 */

import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { logAdminActionForRequest } from '@/lib/adminAuditLog'
import { logFinancialEvent } from '@/lib/api/financialAudit'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { createR2Client, deleteObjectFromR2 } from '@/lib/r2Utils'
import {
  confirmationMatches,
  isSosPurgeScope,
  purgeSosData,
  SOS_PURGE_CONFIRMATION,
} from '@/lib/sos/purgeSosData'
import { assertSosPurgeAllowed } from '@/lib/sos/purgePeriodLock'

const BODY_MAX_BYTES = 512

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId } = await requireAdminFromRequest(req)

  const raw = await req.text()
  if (raw.length > BODY_MAX_BYTES) throw new ApiError(413, 'Payload too large')

  let body: { scope?: unknown; confirmation?: unknown }
  try {
    body = JSON.parse(raw) as { scope?: unknown; confirmation?: unknown }
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  if (!isSosPurgeScope(body.scope)) {
    throw new ApiError(400, 'Invalid scope')
  }
  if (!confirmationMatches(body.scope, body.confirmation)) {
    throw new ApiError(
      400,
      `confirmation must be exactly "${SOS_PURGE_CONFIRMATION[body.scope]}"`,
    )
  }

  const db = await createServiceRoleSupabaseClient()
  await assertSosPurgeAllowed(db, body.scope)
  const { serverEnv } = await import('@/lib/env.server')
  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )
  const bucket = serverEnv.CLOUDFLARE_R2_BUCKET_NAME

  const counts = await purgeSosData(db, body.scope, async (r2Key) => {
    await deleteObjectFromR2(r2Key, s3, bucket)
  })

  await logAdminActionForRequest(req, db, {
    actorId: userId,
    action: 'purged',
    resource: 'sos_data',
    details: { scope: body.scope, ...counts },
  })

  try {
    await logFinancialEvent(db, {
      entityType: 'sos_data',
      entityId: randomUUID(),
      action: 'purged',
      actorId: userId,
      afterData: { scope: body.scope, ...counts },
    })
  } catch {
    // financial audit must not roll back a completed purge
  }

  return NextResponse.json({ ok: true, scope: body.scope, ...counts })
})
