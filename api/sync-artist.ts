/**
 * POST /api/sync-artist
 *
 * Serverless Route Handler — Artist Auto-Sync
 *
 * Accepts a JSON body: { artistId: string }
 *
 * Requires a valid Bearer token (Supabase user session) in the
 * Authorization header. The calling user must have the 'admin' or
 * 'editor' role in the profiles table.
 *
 * Behaviour:
 * 1. Loads the artist row from Supabase.
 * 2. Runs syncArtist() (iTunes / Spotify / Songkick / Discogs).
 * 3. Writes a sync_log entry.
 * 4. Returns the SyncResult as JSON.
 *
 * CORS:
 * If your R2 bucket requires direct presigned-URL uploads from the
 * browser, configure these CORS rules in the Cloudflare R2 console:
 *   AllowedOrigins : ["https://your-domain.com"]
 *   AllowedMethods : ["PUT"]
 *   AllowedHeaders : ["content-type", "x-amz-acl"]
 *   MaxAgeSeconds  : 3600
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { syncArtist, type UploadToR2Fn, type FetchFn } from '../src/lib/sync/syncArtist'
import type { Database } from '../src/types/database'

// ── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SPOTIFY_TOKEN = process.env.SPOTIFY_ACCESS_TOKEN ?? ''
const SONGKICK_API_KEY = process.env.SONGKICK_API_KEY ?? ''

const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? ''
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? ''
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? ''
const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? ''
const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL ?? ''

// ── Helpers ──────────────────────────────────────────────────────────────────

function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
}

function buildUploadToR2(): UploadToR2Fn {
  return async ({ buffer, key, mimeType }) => {
    const r2 = getR2Client()
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
      }),
    )
    return `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  }
}

async function verifyTokenAndRole(token: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase service key not configured')
  }
  const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Error('Unauthorized')

  // Check role
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single()

  if (!profile || !['admin', 'editor'].includes(profile.role)) {
    throw new Error('Forbidden: insufficient role')
  }

  return data.user.id
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // Auth
  const authHeader = req.headers.authorization ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }
  const token = authHeader.slice(7)

  try {
    await verifyTokenAndRole(token)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    res.status(message.includes('Forbidden') ? 403 : 401).json({ error: message })
    return
  }

  // Body
  const body = req.body as Record<string, unknown>
  const artistId = typeof body?.artistId === 'string' ? body.artistId : null
  if (!artistId) {
    res.status(400).json({ error: 'artistId is required' })
    return
  }

  // Create a service-role Supabase client for the sync
  const db = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // Load artist
  const { data: artistRow, error: artistError } = await db
    .from('artists')
    .select('id, name, spotify_id, discogs_id, songkick_id')
    .eq('id', artistId)
    .single()

  if (artistError || !artistRow) {
    res.status(404).json({ error: `Artist not found: ${artistId}` })
    return
  }

  // Create pending sync log
  const { data: logRow } = await db.from('sync_logs').insert({
    artist_id: artistId,
    triggered_by: 'manual',
    status: 'pending',
  }).select().single()

  const logId = logRow?.id

  // Build deps
  const nativeFetch: FetchFn = (url) => fetch(url)
  const uploadToR2: UploadToR2Fn =
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME
      ? buildUploadToR2()
      : async ({ }) => '' // no-op when R2 is not configured

  try {
    const syncResult = await syncArtist(
      {
        id: artistRow.id,
        name: artistRow.name,
        spotifyId: artistRow.spotify_id,
        discogsId: artistRow.discogs_id,
        songkickId: artistRow.songkick_id,
      },
      {
        db,
        fetch: nativeFetch,
        uploadToR2,
        spotifyToken: SPOTIFY_TOKEN || undefined,
        songkickApiKey: SONGKICK_API_KEY || undefined,
      },
    )

    const finalStatus = syncResult.errors.length === 0 ? 'success' : 'partial'

    if (logId) {
      await db.from('sync_logs').update({
        status: finalStatus,
        details: syncResult as unknown as Record<string, unknown>,
      }).eq('id', logId)
    }

    res.status(200).json({ status: finalStatus, result: syncResult })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    if (logId) {
      await db.from('sync_logs').update({
        status: 'error',
        details: { error: message },
      }).eq('id', logId)
    }
    res.status(500).json({ error: message })
  }
}
