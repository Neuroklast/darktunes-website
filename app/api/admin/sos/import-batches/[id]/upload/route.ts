/**
 * POST /api/admin/sos/import-batches/[id]/upload — stream bronze CSV to R2 server-side
 *
 * For files above MAX_BRONZE_CSV_SERVER_BYTES, use the /multipart/* routes instead.
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getImportBatchById } from '@/lib/api/distributorImportBatches'
import { MAX_BRONZE_CSV_SERVER_BYTES } from '@/lib/sos/bronzeUploadLimits'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createR2Client } from '@/lib/r2Utils'

function extractBatchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/import-batches\/([^/]+)\/upload\/?$/)
  return match?.[1] ?? null
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = extractBatchIdFromPath(new URL(req.url).pathname)
  if (!id) throw new ApiError(400, 'Invalid import batch upload path')

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batch = await getImportBatchById(serviceSupabase, id, organizationId)
  if (!batch) throw new ApiError(404, 'Import batch not found')
  if (batch.fileHash || batch.status === 'completed') {
    throw new ApiError(409, 'Import batch already has archived content')
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    throw new ApiError(400, 'Failed to parse form data')
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw new ApiError(400, 'file is required')
  }

  if (file.size > MAX_BRONZE_CSV_SERVER_BYTES) {
    throw new ApiError(
      413,
      `CSV too large for server upload (max ${MAX_BRONZE_CSV_SERVER_BYTES} bytes). Use multipart upload instead.`,
    )
  }

  const body = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'text/csv; charset=utf-8'

  const { serverEnv } = await import('@/lib/env.server')
  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  await s3.send(
    new PutObjectCommand({
      Bucket: serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
      Key: batch.r2Key,
      Body: body,
      ContentType: contentType,
    }),
  )

  return NextResponse.json({ ok: true, r2Key: batch.r2Key })
})