/**
 * app/api/sync/artist/route.ts — Manual artist sync trigger
 *
 * POST /api/sync/artist
 * Body: { artistId: string }
 * Auth: ******
 *
 * Verifies the caller is authenticated, then runs the full multi-API sync
 * pipeline for the given artist via syncSingleArtist (iTunes, Spotify, Discogs,
 * concerts, Odesli — depending on configured env vars and artist IDs).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { syncSingleArtist } from '@/lib/sync/syncAll'
import { createSyncUploadFn } from '@/lib/r2Utils'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { getSyncCredentials } from '@/lib/secrets/getExternalCredentials'
import { revalidatePublicContent, RELEASE_SYNC_TAGS } from '@/lib/sync/revalidatePublicContent'

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { serverEnv } = await import('@/lib/env.server')

  const { organizationId } = await requireAdminFromRequest(request)

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

  const { data: artistRow, error: artistError } = await db
    .from('artists')
    .select('id, organization_id')
    .eq('id', artistId)
    .maybeSingle()

  if (artistError) {
    throw new ApiError(500, artistError.message)
  }
  if (!artistRow) {
    throw new ApiError(404, 'Artist not found')
  }
  // When organization_id is present, enforce host org isolation
  if (
    artistRow.organization_id &&
    artistRow.organization_id !== organizationId
  ) {
    throw new ApiError(403, 'Artist not in this organization')
  }

  const syncCredentials = await getSyncCredentials(db, organizationId)

  const uploadFn = createSyncUploadFn(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
    serverEnv.CLOUDFLARE_R2_PUBLIC_URL,
    organizationId,
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
