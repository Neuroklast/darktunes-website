/**
 * app/api/upload/route.ts — File upload Route Handler
 *
 * Securely handles file uploads to Cloudflare R2 entirely server-side,
 * preventing CORS policy issues that would occur with direct client uploads.
 *
 * Security:
 *   1. Bearer token verified via Supabase — user must be authenticated.
 *   2. Admin or editor role is required (prevents arbitrary authenticated users
 *      from storing files in the label's R2 bucket).
 *   3. R2 credentials are loaded from validated server env (src/lib/env.server.ts).
 *   4. All errors are handled uniformly via withErrorHandler.
 *
 * Replaces the legacy api/upload.ts Vercel serverless function.
 */

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { extname } from 'path'
import { createAssetRecord, getAssetByHash } from '@/lib/api/assets'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createR2Client } from '@/lib/r2Utils'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/** Maximum upload size for admin/editor users: 100 MB */
const MAX_ADMIN_FILE_SIZE = 100 * 1024 * 1024

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { userId, organizationId } = await requireAdminOrEditorFromRequest(request)

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

  if (file.size > MAX_ADMIN_FILE_SIZE) {
    throw new ApiError(413, 'File too large (max 100 MB)')
  }

  const folderId = (formData.get('folderId') as string | null) || null
  const artistId = (formData.get('artistId') as string | null) || null
  const mimeType = file.type || 'application/octet-stream'

  // Read once — arrayBuffer() consumes the FormData File; reusing file.stream()
  // afterwards makes the AWS SDK fail with "Unable to calculate hash for flowing readable stream".
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const hashBuf = await crypto.subtle.digest('SHA-256', fileBuffer)
  const sha256Hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const supabase = await createServerSupabaseClient()

  // When uploading from an artist context (e.g. artist edit form), auto-resolve
  // the artist's root folder so the asset lands in the right place immediately.
  let resolvedFolderId = folderId
  if (artistId && !folderId) {
    const { data: rootFolder } = await supabase
      .from('asset_folders')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('artist_id', artistId)
      .is('parent_id', null)
      .maybeSingle()
    if (rootFolder?.id) resolvedFolderId = rootFolder.id
  }

  const existingAsset = await getAssetByHash(supabase, sha256Hash, organizationId)
  if (existingAsset) {
    return NextResponse.json({
      duplicate: true,
      asset: existingAsset,
      publicUrl: existingAsset.publicUrl,
      r2Key: existingAsset.r2Key,
      filename: existingAsset.filename,
      mimeType: existingAsset.mimeType,
      sizeBytes: existingAsset.sizeBytes,
    })
  }

  const ext = extname(file.name) || ''
  const { buildTenantObjectKey } = await import('@/lib/organizations/r2Keys')
  const r2Key = buildTenantObjectKey(organizationId, `uploads/${randomUUID()}${ext}`)
  const { serverEnv } = await import('@/lib/env.server')
  const r2 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  await r2.send(
    new PutObjectCommand({
      Bucket: serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: mimeType,
      ContentLength: fileBuffer.length,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  const publicUrl = `${serverEnv.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, '')}/${r2Key}`
  const filename = r2Key.split('/').pop() ?? r2Key
  const asset = await createAssetRecord(supabase, {
    organization_id: organizationId,
    filename,
    original_filename: file.name,
    mime_type: mimeType,
    // Prefer actual buffer length (matches R2 ContentLength); file.size can disagree for some browsers.
    size_bytes: fileBuffer.length,
    r2_key: r2Key,
    public_url: publicUrl,
    uploaded_by: userId,
    folder_id: resolvedFolderId,
    artist_id: artistId,
    tags: [],
    sha256_hash: sha256Hash,
  })

  return NextResponse.json({
    duplicate: false,
    asset,
    publicUrl,
    r2Key,
    filename,
    mimeType,
    sizeBytes: fileBuffer.length,
  })
})
