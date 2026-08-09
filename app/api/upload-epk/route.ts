/**
 * app/api/upload-epk/route.ts — Server-side EPK file upload
 *
 * POST /api/upload-epk
 * Auth: ****** (admin only)
 *
 * Accepts press-photo and promo-track file uploads and stores them in
 * Cloudflare R2 entirely server-side, avoiding the CORS restriction that
 * prevents the browser from PUT-ing directly to the r2.cloudflarestorage.com
 * endpoint via a presigned URL.
 *
 * Form fields:
 *   file         — the binary file (required)
 *   category     — "press-photos" | "promo-tracks" (required)
 *
 * Returns: { r2Key, publicUrl }
 *
 * Note: Vercel's serverless body limit is 4.5 MB on Hobby and 50 MB on Pro.
 * Sales Statement bronze CSVs use chunked multipart via /api/admin/sos/import-batches/* instead.
 * Browser presigned PUT requires R2 bucket CORS (see DEPLOYMENT.md §3).
 */

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { ApiError, buildApiError, withErrorHandler } from '@/lib/errors'
import { buildTenantObjectKey } from '@/lib/organizations/r2Keys'
import { createR2Client } from '@/lib/r2Utils'

const ALLOWED_CATEGORIES = ['press-photos', 'promo-tracks'] as const
type EpkCategory = (typeof ALLOWED_CATEGORIES)[number]

function isAllowedCategory(v: string | null): v is EpkCategory {
  return ALLOWED_CATEGORIES.includes(v as EpkCategory)
}

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  // 1. Auth — admin/editor for host organization (EPK content is sensitive)
  const { organizationId } = await requireAdminOrEditorFromRequest(request)

  // 2. Parse form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw new ApiError(400, 'Failed to parse form data')
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw new ApiError(400, 'No file found in request')
  }

  const category = formData.get('category') as string | null
  if (!isAllowedCategory(category)) {
    throw new ApiError(400, `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(', ')}`)
  }

  // 3. Read R2 config
  const {
    CLOUDFLARE_R2_ACCOUNT_ID,
    CLOUDFLARE_R2_ACCESS_KEY_ID,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    CLOUDFLARE_R2_BUCKET_NAME,
    CLOUDFLARE_R2_PUBLIC_URL,
  } = process.env

  if (
    !CLOUDFLARE_R2_ACCOUNT_ID ||
    !CLOUDFLARE_R2_ACCESS_KEY_ID ||
    !CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
    !CLOUDFLARE_R2_BUCKET_NAME ||
    !CLOUDFLARE_R2_PUBLIC_URL
  ) {
    throw buildApiError('CONFIG_ERROR', 500)
  }

  // 4. Upload to R2 server-side (tenant-prefixed for non–Org-#0)
  const ext = file.name.split('.').pop() ?? 'bin'
  const r2Key = buildTenantObjectKey(organizationId, `${category}/${randomUUID()}.${ext}`)
  const publicUrl = `${CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, '')}/${r2Key}`
  const mimeType = file.type || 'application/octet-stream'
  const buffer = Buffer.from(await file.arrayBuffer())

  const r2 = createR2Client(
    CLOUDFLARE_R2_ACCOUNT_ID,
    CLOUDFLARE_R2_ACCESS_KEY_ID,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  await r2.send(
    new PutObjectCommand({
      Bucket: CLOUDFLARE_R2_BUCKET_NAME,
      Key: r2Key,
      Body: buffer,
      ContentType: mimeType,
      ContentLength: buffer.length,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return NextResponse.json({ r2Key, publicUrl })
})
