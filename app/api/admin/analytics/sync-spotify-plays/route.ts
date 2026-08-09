/**
 * POST /api/admin/analytics/sync-spotify-plays
 *
 * Scrapes public Spotify play counts / monthly listeners via Apify actor
 * beatanalytics/spotify-play-count-scraper for visible artists & releases
 * that have a Spotify id/url. Token from Admin → API Keys (not Vercel env).
 *
 * Auth: admin cookie/Bearer, or CRON_SECRET (scheduled monthly job).
 * - Admin UI: host organization roster + budget only
 * - Cron / sync-trigger: fan-out across all active organizations
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
  type SpotifyPlaySyncResult,
  type SpotifyPlaySyncScope,
} from '@/lib/analytics/syncSpotifyPlayCounts'
import { listActiveOrganizations } from '@/lib/api/listActiveOrganizations'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

export const maxDuration = 300

const SCOPES = new Set<SpotifyPlaySyncScope>(['artists', 'releases', 'all'])

type AuthMode =
  | { mode: 'admin'; organizationId: string }
  | { mode: 'fanout' }

async function authorize(req: NextRequest): Promise<AuthMode> {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (isCron) {
    if (!cronSecret || !isValidCronSecret(authHeader, cronSecret)) {
      throw new ApiError(401, 'Unauthorized')
    }
    return { mode: 'fanout' }
  }

  if (cronSecret && isValidCronSecret(authHeader, cronSecret)) {
    return { mode: 'fanout' }
  }

  // Prefer admin session (cookie or Bearer) for the Admin UI
  try {
    const auth = await requireAdminFromRequest(req)
    return { mode: 'admin', organizationId: auth.organizationId }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && authHeader.startsWith('Bearer ')) {
      const token = extractBearerToken(authHeader)
      await verifySyncTrigger(token)
      return { mode: 'fanout' }
    }
    throw err
  }
}

function resultStatus(
  result: SpotifyPlaySyncResult,
  dryRun: boolean,
): 'success' | 'partial' | 'error' {
  if (result.errors.length === 0) return 'success'
  if (result.urlsCharged > 0 || result.upserted.listenerRows > 0 || result.upserted.trackRows > 0) {
    return 'partial'
  }
  return dryRun ? 'success' : 'error'
}

async function logApifySync(
  db: Awaited<ReturnType<typeof createServiceRoleSupabaseClient>>,
  result: SpotifyPlaySyncResult,
  organizationId: string,
  dryRun: boolean,
): Promise<void> {
  await db.from('sync_logs').insert({
    artist_id: null,
    status: resultStatus(result, dryRun),
    message: result.errors[0]?.message ?? null,
    releases_synced: result.upserted.trackRows + result.upserted.listenerRows,
    errors: result.errors.map((e) =>
      e.spotifyId ? `${e.spotifyId}: ${e.message}` : e.message,
    ),
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
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const auth = await authorize(req)

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

  // Admin UI: single host org only
  if (auth.mode === 'admin') {
    const result = await syncSpotifyPlayCounts(serviceSupabase, apifyToken, {
      scope,
      dryRun,
      organizationId: auth.organizationId,
    })
    await logApifySync(serviceSupabase, result, auth.organizationId, dryRun)
    return NextResponse.json(result)
  }

  // Cron / sync-trigger: fan-out active organizations with shared wall-clock budget
  const orgs = await listActiveOrganizations(serviceSupabase)
  const wallStart = Date.now()
  const wallBudgetMs = 280_000
  const perOrgResults: Array<{
    organizationId: string
    slug: string
    ok: boolean
    result?: SpotifyPlaySyncResult
    error?: string
  }> = []

  for (const org of orgs) {
    const remaining = wallBudgetMs - (Date.now() - wallStart)
    if (remaining < 15_000) {
      perOrgResults.push({
        organizationId: org.id,
        slug: org.slug,
        ok: false,
        error: 'Skipped: wall-clock budget exhausted',
      })
      continue
    }

    try {
      const result = await syncSpotifyPlayCounts(serviceSupabase, apifyToken, {
        scope,
        dryRun,
        organizationId: org.id,
        timeBudgetMs: Math.min(remaining - 5_000, 120_000),
      })
      await logApifySync(serviceSupabase, result, org.id, dryRun)
      perOrgResults.push({
        organizationId: org.id,
        slug: org.slug,
        ok: true,
        result,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // No targets for a pilot org is not a hard platform failure
      if (err instanceof ApiError && err.code === 'APIFY_NO_TARGETS') {
        perOrgResults.push({
          organizationId: org.id,
          slug: org.slug,
          ok: true,
          error: message,
        })
        continue
      }
      perOrgResults.push({
        organizationId: org.id,
        slug: org.slug,
        ok: false,
        error: message,
      })
    }
  }

  const anyOk = perOrgResults.some((r) => r.ok && r.result)
  const primary =
    perOrgResults.find((r) => r.organizationId === DEFAULT_ORGANIZATION_ID && r.result)?.result ??
    perOrgResults.find((r) => r.result)?.result ??
    null

  return NextResponse.json({
    multiOrg: true,
    organizations: perOrgResults.map((r) => ({
      organizationId: r.organizationId,
      slug: r.slug,
      ok: r.ok,
      error: r.error,
      urlsCharged: r.result?.urlsCharged ?? 0,
      period: r.result?.period,
      budget: r.result?.budget,
      targets: r.result?.targets,
      upserted: r.result?.upserted,
      errors: r.result?.errors,
    })),
    // Backward-compatible top-level fields for Health UI (prefer Org #0)
    ...(primary ?? {
      period: null,
      dryRun,
      urlsCharged: 0,
      errors: anyOk ? [] : [{ message: 'No organization completed Apify sync' }],
    }),
  })
})
