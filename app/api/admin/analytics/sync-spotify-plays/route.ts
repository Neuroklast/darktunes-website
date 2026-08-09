/**
 * POST /api/admin/analytics/sync-spotify-plays
 *
 * Scrapes public Spotify play counts / monthly listeners via Apify actor
 * beatanalytics/spotify-play-count-scraper for visible artists & releases
 * that have a Spotify id/url. Token from Admin → API Keys (not Vercel env).
 *
 * Auth: admin cookie/Bearer, or CRON_SECRET (scheduled monthly job).
 * Host organization scopes roster + Apify monthly budget (Org #0 for cron).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  extractBearerToken,
  requireAdminFromRequest,
  verifySyncTrigger,
} from '@/lib/adminAuth'
import { isValidCronSecret } from '@/lib/cronAuth'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { getApifyCredentials } from '@/lib/secrets/getExternalCredentials'
import {
  syncSpotifyPlayCounts,
  type SpotifyPlaySyncScope,
} from '@/lib/analytics/syncSpotifyPlayCounts'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

export const maxDuration = 300

const SCOPES = new Set<SpotifyPlaySyncScope>(['artists', 'releases', 'all'])

async function authorize(
  req: NextRequest,
): Promise<{ organizationId: string }> {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (isCron) {
    if (!cronSecret || !isValidCronSecret(authHeader, cronSecret)) {
      throw new ApiError(401, 'Unauthorized')
    }
    return { organizationId: DEFAULT_ORGANIZATION_ID }
  }

  if (cronSecret && isValidCronSecret(authHeader, cronSecret)) {
    return { organizationId: DEFAULT_ORGANIZATION_ID }
  }

  // Prefer admin session (cookie or Bearer) for the Admin UI
  try {
    const auth = await requireAdminFromRequest(req)
    return { organizationId: auth.organizationId }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && authHeader.startsWith('Bearer ')) {
      const token = extractBearerToken(authHeader)
      await verifySyncTrigger(token)
      return { organizationId: DEFAULT_ORGANIZATION_ID }
    }
    throw err
  }
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await authorize(req)

  let scope: SpotifyPlaySyncScope = 'all'
  let dryRun = false

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const body = (await req.json()) as { scope?: string; dryRun?: boolean }
      if (body.scope !== undefined) {
        if (!SCOPES.has(body.scope as SpotifyPlaySyncScope)) {
          throw new ApiError(
            400,
            'Invalid scope. Use "artists", "releases", or "all".',
            'VALIDATION_ERROR',
          )
        }
        scope = body.scope as SpotifyPlaySyncScope
      }
      dryRun = body.dryRun === true
    } catch (err) {
      if (err instanceof ApiError) throw err
      throw new ApiError(400, 'Invalid JSON body.', 'VALIDATION_ERROR')
    }
  }

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const { apifyToken } = await getApifyCredentials(serviceSupabase)

  const result = await syncSpotifyPlayCounts(serviceSupabase, apifyToken, {
    scope,
    dryRun,
    organizationId,
  })

  const status =
    result.errors.length === 0
      ? 'success'
      : result.urlsCharged > 0 || result.upserted.listenerRows > 0 || result.upserted.trackRows > 0
        ? 'partial'
        : dryRun
          ? 'success'
          : 'error'

  await serviceSupabase.from('sync_logs').insert({
    artist_id: null,
    status,
    message: result.errors[0]?.message ?? null,
    releases_synced: result.upserted.trackRows + result.upserted.listenerRows,
    errors: result.errors.map((e) =>
      e.spotifyId ? `${e.spotifyId}: ${e.message}` : e.message,
    ),
    // Health dashboard keys this as `apify` (see getKnownApiConfiguration / normalizeHealthApiSource).
    api_source: 'apify',
    rate_limited: false,
    duration_ms: result.durationMs,
    metadata: {
      scope: result.scope,
      dry_run: result.dryRun,
      period: result.period,
      budget: result.budget,
      targets: result.targets,
      urls_charged: result.urlsCharged,
      batches: result.batches,
      partial: result.partial,
      upserted: result.upserted,
      organization_id: organizationId,
    },
  })

  return NextResponse.json(result)
})
