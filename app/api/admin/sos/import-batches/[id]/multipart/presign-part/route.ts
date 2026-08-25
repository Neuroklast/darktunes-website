/**
 * POST /api/admin/sos/import-batches/[id]/multipart/presign-part — presigned UploadPart URL (browser → R2)
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getWritableImportBatch } from '@/lib/sos/bronzeMultipartUpload'
import { generateBronzePresignedPartUrl } from '@/lib/sos/bronzePresignedUpload'
import { ApiError, withErrorHandler } from '@/lib/errors'

const BODY_MAX_BYTES = 512

function extractBatchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/import-batches\/([^/]+)\/multipart\/presign-part\/?$/)
  return match?.[1] ?? null
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = extractBatchIdFromPath(new URL(req.url).pathname)
  if (!id) throw new ApiError(400, 'Invalid multipart presign-part path')

  const raw = await req.text()
  if (raw.length > BODY_MAX_BYTES) throw new ApiError(413, 'Presign payload too large')

  const body = JSON.parse(raw) as { upload_id?: string; part_number?: number }
  const uploadId = body.upload_id?.trim()
  if (!uploadId) throw new ApiError(400, 'upload_id is required')

  const partNumber = Number(body.part_number)
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw new ApiError(400, 'part_number must be a positive integer')
  }

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batch = await getWritableImportBatch(serviceSupabase, id, organizationId)
  const uploadUrl = await generateBronzePresignedPartUrl(batch.r2Key, uploadId, partNumber)

  return NextResponse.json({ uploadUrl, partNumber })
})