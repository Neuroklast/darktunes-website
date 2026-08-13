/**
 * PATCH /api/admin/sos/import-batches/[id]/confirm — verify R2 content and store file hash
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { findImportBatchByFileHash, getImportBatchById } from '@/lib/api/distributorImportBatches'
import { writeAppLog } from '@/lib/appLog'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createR2Client, sha256HexFromR2Object } from '@/lib/r2Utils'

function extractBatchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/import-batches\/([^/]+)\/confirm\/?$/)
  return match?.[1] ?? null
}

export const PATCH = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireAdminFromRequest(req)
  const id = extractBatchIdFromPath(new URL(req.url).pathname)
  if (!id) throw new ApiError(400, 'Invalid import batch path')

  const raw = await req.text()
  if (raw.length > 4_096) throw new ApiError(413, 'Confirm payload too large')

  const body = JSON.parse(raw) as { file_hash?: string }
  const fileHash = body.file_hash?.trim()
  if (!fileHash || !/^[a-f0-9]{64}$/i.test(fileHash)) {
    throw new ApiError(400, 'file_hash must be a SHA-256 hex digest')
  }

  const normalizedHash = fileHash.toLowerCase()
  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batch = await getImportBatchById(serviceSupabase, id)
  if (!batch) throw new ApiError(404, 'Import batch not found')

  const { serverEnv } = await import('@/lib/env.server')
  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  const computedHash = await sha256HexFromR2Object(
    batch.r2Key,
    s3,
    serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
  )
  if (computedHash !== normalizedHash) {
    await writeAppLog({
      source: 'sos.bronze.confirm',
      level: 'error',
      message: 'Bronze confirm hash mismatch',
      details: { batchId: id, r2Key: batch.r2Key },
    })
    throw new ApiError(400, 'file_hash does not match R2 object content')
  }

  const { error } = await serviceSupabase
    .from('distributor_import_batches')
    .update({ file_hash: normalizedHash, status: 'completed' })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      const existing = await findImportBatchByFileHash(serviceSupabase, normalizedHash)
      if (existing) {
        return NextResponse.json({ ok: true, duplicate: true, batch: existing })
      }
    }
    throw new ApiError(500, error.message)
  }

  return NextResponse.json({ ok: true })
})