/**
 * POST /api/admin/sos/import-batches/[id]/multipart/complete — finalize R2 multipart upload
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  completeBronzeMultipartUpload,
  createBronzeMultipartR2Context,
  getWritableImportBatch,
  type BronzeMultipartPartRef,
} from '@/lib/sos/bronzeMultipartUpload'
import { ApiError, withErrorHandler } from '@/lib/errors'

const COMPLETE_BODY_MAX_BYTES = 65_536

function extractBatchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/import-batches\/([^/]+)\/multipart\/complete\/?$/)
  return match?.[1] ?? null
}

function parseParts(value: unknown): BronzeMultipartPartRef[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, 'parts must be a non-empty array')
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new ApiError(400, `parts[${index}] must be an object`)
    }
    const partNumber = Number((entry as { partNumber?: unknown }).partNumber)
    const etag = String((entry as { etag?: unknown }).etag ?? '').trim()
    if (!Number.isInteger(partNumber) || partNumber < 1) {
      throw new ApiError(400, `parts[${index}].partNumber must be a positive integer`)
    }
    if (!etag) throw new ApiError(400, `parts[${index}].etag is required`)
    return { partNumber, etag }
  })
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = extractBatchIdFromPath(new URL(req.url).pathname)
  if (!id) throw new ApiError(400, 'Invalid import batch multipart complete path')

  const raw = await req.text()
  if (raw.length > COMPLETE_BODY_MAX_BYTES) throw new ApiError(413, 'Complete payload too large')

  const body = JSON.parse(raw) as { upload_id?: string; parts?: unknown }
  const uploadId = body.upload_id?.trim()
  if (!uploadId) throw new ApiError(400, 'upload_id is required')

  const parts = parseParts(body.parts)

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batch = await getWritableImportBatch(serviceSupabase, id, organizationId)
  const ctx = await createBronzeMultipartR2Context()
  await completeBronzeMultipartUpload(ctx, batch.r2Key, uploadId, parts)

  return NextResponse.json({ ok: true, r2Key: batch.r2Key })
})