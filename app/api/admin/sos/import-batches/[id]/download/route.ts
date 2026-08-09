/**
 * GET /api/admin/sos/import-batches/[id]/download — stream bronze CSV from R2 server-side
 *
 * Admin UI must use this route instead of fetching a presigned R2 URL in the browser
 * (bucket CORS is not configured for www.darktunes.com).
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getImportBatchById } from '@/lib/api/distributorImportBatches'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createR2Client, downloadObjectFromR2 } from '@/lib/r2Utils'

function extractBatchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/import-batches\/([^/]+)\/download\/?$/)
  return match?.[1] ?? null
}

function filenameFromR2Key(r2Key: string): string {
  const base = r2Key.split('/').pop() ?? 'bronze.csv'
  const underscore = base.indexOf('_')
  return underscore >= 0 ? base.slice(underscore + 1) : base
}

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = extractBatchIdFromPath(new URL(req.url).pathname)
  if (!id) throw new ApiError(400, 'Invalid import batch download path')

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batch = await getImportBatchById(serviceSupabase, id, organizationId)
  if (!batch) throw new ApiError(404, 'Import batch not found')
  if (!batch.fileHash) throw new ApiError(409, 'Import batch has no archived content yet')

  const { serverEnv } = await import('@/lib/env.server')
  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  const csvText = await downloadObjectFromR2(batch.r2Key, s3, serverEnv.CLOUDFLARE_R2_BUCKET_NAME)
  const filename = filenameFromR2Key(batch.r2Key)

  return new NextResponse(csvText, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
    },
  })
})