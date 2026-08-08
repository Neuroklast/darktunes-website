import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withErrorHandler, ApiError } from '@/lib/errors'
import type { Database } from '@/types/database'
import { createR2Client, deleteObjectFromR2 } from '@/lib/r2Utils'
import { createArtistAsset, deleteArtistAsset } from '@/lib/api/artistAssets'
import { createAssetRecord } from '@/lib/api/assets'
import { portalMemberWrite, withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'
import { getClientIp } from '@/lib/ipRateLimit'
import {
  PORTAL_ASSET_MAX_BYTES,
  PORTAL_ASSET_MIME,
  PORTAL_UPLOAD_RATE,
} from '@/lib/uploads/portalUploadLimits'
import { emitNotification } from '@/lib/notifications/emit'

const deleteSchema = z.object({ id: z.string() })

function extFromMimeType(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'application/zip') return 'zip'
  return 'bin'
}

async function uploadAssetToR2(
  file: File,
  artistId: string,
  s3: S3Client,
  bucket: string,
  r2PublicUrl: string,
): Promise<{ key: string; url: string }> {
  const contentType = file.type || 'application/octet-stream'
  const ext = extFromMimeType(contentType)
  const key = `artist-assets/${artistId}/${randomUUID()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return { key, url: `${r2PublicUrl.replace(/\/$/, '')}/${key}` }
}

/** Look up the asset_folder that belongs to this artist (the artist's root folder). */
async function getOrCreateArtistFolder(
  supabase: SupabaseClient<Database>,
  artistId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('asset_folders')
    .select('id')
    .eq('artist_id', artistId)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

/** Lazy-create a `landing` subfolder under the artist's asset folder for Fan Page uploads. */
async function getOrCreateLandingSubfolder(
  serviceRole: SupabaseClient<Database>,
  artistId: string,
): Promise<string | null> {
  const artistFolderId = await getOrCreateArtistFolder(serviceRole, artistId)
  if (!artistFolderId) return null

  const { data: existing } = await serviceRole
    .from('asset_folders')
    .select('id')
    .eq('parent_id', artistFolderId)
    .eq('name', 'landing')
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: created, error } = await serviceRole
    .from('asset_folders')
    .insert({
      name: 'landing',
      parent_id: artistFolderId,
      artist_id: artistId,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return created?.id ?? null
}

const ROUTE_POST = 'POST /api/portal/upload-asset'
const ROUTE_DELETE = 'DELETE /api/portal/upload-asset'

export const POST = withErrorHandler(async (req: NextRequest) => {
  const url = new URL(req.url)
  const artistId = url.searchParams.get('artistId')
  const source = url.searchParams.get('source')
  const ctx = await withPortalMembershipWrite(req, artistId)
  const { artist, user, serviceDb } = ctx
  const userId = user.id

  const ip = getClientIp(req)
  const rl = await checkDistributedRateLimit(
    `upload-asset:${userId}:${ip}`,
    PORTAL_UPLOAD_RATE.max,
    PORTAL_UPLOAD_RATE.windowMs,
  )
  if (rl.limited) throw new ApiError(429, 'Too many uploads. Please wait and try again.')

  const formData = await req.formData()
  const file = formData.get('file')
  const label = formData.get('label')
  const suggestForPress = formData.get('pressSuggested') === 'true'

  if (!(file instanceof File)) throw new ApiError(400, 'No file provided')

  if (file.size > PORTAL_ASSET_MAX_BYTES) throw new ApiError(413, 'File too large (max 20 MB)')

  if (!PORTAL_ASSET_MIME.has(file.type)) {
    throw new ApiError(415, 'Unsupported file type. Allowed: JPEG, PNG, WebP, PDF, ZIP')
  }

  // Enforce per-artist storage quota when one has been configured
  if (artist.storageQuotaBytes != null && artist.storageQuotaBytes > 0) {
    const { value: usedBytes } = await portalMemberWrite(
      ctx,
      { route: ROUTE_POST, table: 'assets', operation: 'select' },
      async (db) => {
        const { data: usageData } = await db
          .from('assets')
          .select('size_bytes')
          .eq('artist_id', artist.id)
        return (usageData ?? []).reduce((sum, row) => sum + (row.size_bytes ?? 0), 0)
      },
    )
    if (usedBytes + file.size > artist.storageQuotaBytes) {
      throw new ApiError(507, 'Storage quota exceeded. Please contact your label to increase your quota.')
    }
  }

  const { serverEnv } = await import('@/lib/env.server')
  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  const uploaded = await uploadAssetToR2(
    file,
    artist.id,
    s3,
    serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
    serverEnv.CLOUDFLARE_R2_PUBLIC_URL,
  )

  const isLandingUpload = source === 'landing'

  // Get artist's folder id (auto-created by DB trigger on artist insert)
  const { value: folderId } = await portalMemberWrite(
    ctx,
    { route: ROUTE_POST, table: 'asset_folders', operation: 'select' },
    (db) =>
      isLandingUpload
        ? getOrCreateLandingSubfolder(db, artist.id)
        : getOrCreateArtistFolder(db, artist.id),
  )

  // Write DB records. On failure, delete the already-uploaded R2 object so it
  // doesn't become an orphaned (cost-incurring) file in the bucket.
  const isImage = file.type.startsWith('image/')
  const pressSuggested = suggestForPress && isImage

  let asset
  let mainAssetId: string | null = null
  try {
    const { value: mainAsset } = await portalMemberWrite(
      ctx,
      { route: ROUTE_POST, table: 'assets', operation: 'insert' },
      (db) =>
        createAssetRecord(db, {
          filename: file.name,
          original_filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          r2_key: uploaded.key,
          public_url: uploaded.url,
          uploaded_by: userId,
          folder_id: folderId,
          artist_id: artist.id,
          press_suggested: pressSuggested,
          tags: isLandingUpload ? ['landing_editor'] : undefined,
        }),
    )
    mainAssetId = mainAsset.id

    const { value: artistAsset } = await portalMemberWrite(
      ctx,
      { route: ROUTE_POST, table: 'artist_assets', operation: 'insert' },
      (db) =>
        createArtistAsset(db, {
          artist_id: artist.id,
          filename: file.name,
          original_filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          r2_key: uploaded.key,
          public_url: uploaded.url,
          label: typeof label === 'string' && label.trim() ? label.trim() : null,
        }),
    )
    asset = artistAsset
  } catch (dbErr) {
    // Compensating transaction: remove the R2 object to avoid orphaned storage
    try {
      await deleteObjectFromR2(uploaded.key, s3, serverEnv.CLOUDFLARE_R2_BUCKET_NAME)
    } catch {
      console.error('[upload-asset] R2 rollback failed for key:', uploaded.key)
    }
    throw dbErr
  }

  // Staff notifications — service role via platform emit
  if (pressSuggested && mainAssetId) {
    await emitNotification(serviceDb, {
      type: 'press_asset_suggestion',
      entityId: mainAssetId,
      entityName: `${artist.name}: ${file.name}`,
      senderId: userId,
      artistId: artist.id,
      dedupeKey: `press_asset_suggestion:${mainAssetId}`,
    })
  }

  return NextResponse.json({ asset })
})

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const artistId = new URL(req.url).searchParams.get('artistId')
  const ctx = await withPortalMembershipWrite(req, artistId)
  const { artist } = ctx

  const body = deleteSchema.parse(await req.json())
  const assetId = body.id

  const { value: asset } = await portalMemberWrite(
    ctx,
    { route: ROUTE_DELETE, table: 'artist_assets', operation: 'select' },
    async (db) => {
      const { data } = await db
        .from('artist_assets')
        .select('id, artist_id')
        .eq('id', assetId)
        .eq('artist_id', artist.id)
        .maybeSingle()
      return data
    },
  )

  if (!asset) throw new ApiError(404, 'Asset not found')

  await portalMemberWrite(
    ctx,
    { route: ROUTE_DELETE, table: 'artist_assets', operation: 'delete' },
    (db) => deleteArtistAsset(db, assetId),
  )

  return NextResponse.json({ success: true })
})
