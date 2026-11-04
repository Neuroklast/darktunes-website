/**
 * app/api/sync/artist/route.ts — Manual artist sync trigger
 *
 * POST /api/sync/artist
 * Body: { artistId: string }
 * Auth: ******
 *
 * Verifies the caller is authenticated, then runs the full multi-API sync
 * pipeline for the given artist via syncSingleArtist (iTunes, Spotify, Discogs,
 * concerts — depending on configured credentials and artist IDs).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { syncSingleArtist } from '@/lib/sync/syncAll'
import { createSyncUploadFn } from '@/lib/r2Utils'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { getSyncCredentials } from '@/lib/secrets/getExternalCredentials'
import { revalidatePublicContent, RELEASE_SYNC_TAGS } from '@/lib/sync/revalidatePublicContent'

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { serverEnv } = await import('@/lib/env.server')

  const authHeader = request.headers.get('authorization') ?? ''
  const token = extractBearerToken(authHeader)
  await verifyAdmin(token)

  let artistId: string | undefined
  try {
    const body: unknown = await request.json()
    if (typeof body === 'object' && body !== null && 'artistId' in body) {
      artistId = String((body as { artistId: unknown }).artistId)
    }
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  if (!artistId) {
    throw new ApiError(400, 'Missing required field: artistId')
  }

  const db = createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  const syncCredentials = await getSyncCredentials(db)

  const uploadFn = createSyncUploadFn(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
    serverEnv.CLOUDFLARE_R2_PUBLIC_URL,
  )

  const result = await syncSingleArtist(artistId, 'full', {
    db,
    fetch: globalThis.fetch,
    uploadToR2: uploadFn,
    spotify: syncCredentials.spotify,
    discogsToken: syncCredentials.discogsToken,
    songkickApiKey: syncCredentials.songkickApiKey,
    bandsintownApiKey: syncCredentials.bandsintownApiKey,
  })

  revalidatePublicContent(RELEASE_SYNC_TAGS)
  return NextResponse.json(result)
})

export const GET = POST
