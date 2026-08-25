/**
 * GET    /api/admin/sos/import-batches/[id] — fetch batch metadata + presigned download URL (server-side use only)
 *          Admin UI must load CSV via GET /download — never fetch downloadUrl from the browser (R2 CORS).
 * PATCH  /api/admin/sos/import-batches/[id] — mark unconfirmed upload as failed
 * DELETE /api/admin/sos/import-batches/[id] — delete batch + its R2 object (confirmed or not)
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  deleteImportBatch,
  getImportBatchById,
  updateImportBatchStatus,
} from '@/lib/api/distributorImportBatches'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createR2Client, deleteObjectFromR2 } from '@/lib/r2Utils'

function extractBatchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/import-batches\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = extractBatchIdFromPath(new URL(req.url).pathname)
  if (!id) throw new ApiError(400, 'Invalid import batch path')

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batch = await getImportBatchById(serviceSupabase, id, organizationId)
  if (!batch) throw new ApiError(404, 'Import batch not found')

  const { serverEnv } = await import('@/lib/env.server')
  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
  const { generatePresignedDownloadUrl } = await import('@/lib/portal/presignedUrl')
  const downloadUrl = await generatePresignedDownloadUrl(batch.r2Key, {
    getSignedUrl,
    s3Client: s3,
    bucket: serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
  })

  return NextResponse.json({ batch, downloadUrl })
})

export const PATCH = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = extractBatchIdFromPath(new URL(req.url).pathname)
  if (!id) throw new ApiError(400, 'Invalid import batch path')

  const raw = await req.text()
  if (raw.length > 256) throw new ApiError(413, 'Payload too large')

  const body = JSON.parse(raw) as { status?: string }
  if (body.status !== 'failed') {
    throw new ApiError(400, 'Only status "failed" is supported')
  }

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batch = await getImportBatchById(serviceSupabase, id, organizationId)
  if (!batch) throw new ApiError(404, 'Import batch not found')
  if (batch.fileHash) {
    throw new ApiError(409, 'Cannot mark a confirmed batch as failed')
  }

  await updateImportBatchStatus(serviceSupabase, id, 'failed')
  return NextResponse.json({ ok: true })
})

export const DELETE = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = extractBatchIdFromPath(new URL(req.url).pathname)
  if (!id) throw new ApiError(400, 'Invalid import batch path')

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batch = await getImportBatchById(serviceSupabase, id, organizationId)
  if (!batch) throw new ApiError(404, 'Import batch not found')

  const { serverEnv } = await import('@/lib/env.server')
  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )
  try {
    await deleteObjectFromR2(
      batch.r2Key,
      s3,
      serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
      organizationId,
    )
  } catch (err) {
    // best effort; do not block DB cleanup
    console.warn('[import-batches] R2 delete best-effort failed for batch', id, err)
  }

  const deleted = await deleteImportBatch(serviceSupabase, id)
  if (!deleted) throw new ApiError(404, 'Import batch not found')

  return NextResponse.json({ ok: true })
})