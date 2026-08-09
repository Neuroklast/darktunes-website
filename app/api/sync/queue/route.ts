/**
 * app/api/sync/queue/route.ts
 *
 * POST — enqueue full artist sync jobs for every artist
 * GET  — return current queue stats (pending/running/done/failed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { extractBearerToken, verifySyncTrigger } from '@/lib/adminAuth'
import { isValidCronSecret } from '@/lib/cronAuth'
import { enqueueArtistSyncJobs, getSyncQueueStats } from '@/lib/api/syncQueue'
import { listActiveOrganizations } from '@/lib/api/listActiveOrganizations'
import { recordHealthHeartbeat } from '@/lib/health/heartbeats'

// Route-segment config: allow up to 300 seconds on Vercel Pro.
export const maxDuration = 300

async function authorizeSyncRequest(request: NextRequest): Promise<void> {
  const { serverEnv } = await import('@/lib/env.server')
  const authHeader = request.headers.get('authorization') ?? ''
  const { CRON_SECRET: cronSecret } = serverEnv

  if (!authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Missing or invalid Authorization header')
  }
  const isCronAuthorized = Boolean(cronSecret && isValidCronSecret(authHeader, cronSecret))

  if (!isCronAuthorized) {
    const token = extractBearerToken(authHeader)
    await verifySyncTrigger(token)
  }
}

function createServiceDb(
  serverEnv: Awaited<typeof import('@/lib/env.server')>['serverEnv'],
) {
  return createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )
}

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  await authorizeSyncRequest(request)
  const { serverEnv } = await import('@/lib/env.server')
  const db = createServiceDb(serverEnv)

  const orgs = await listActiveOrganizations(db)
  let queued = 0
  let total = 0
  const perOrg: Array<{ organizationId: string; slug: string; total: number; queued: number }> =
    []

  for (const org of orgs) {
    const { data: artists, error: artistsError } = await db
      .from('artists')
      .select('id')
      .eq('organization_id', org.id)
      .order('name', { ascending: true })

    if (artistsError) {
      // Column missing: fall back to unscoped list for Org #0 only
      if (orgs.length === 1) {
        const fallback = await db.from('artists').select('id').order('name', { ascending: true })
        if (fallback.error) {
          throw new ApiError(500, 'Failed to load artists: ' + fallback.error.message)
        }
        const artistIds = (fallback.data ?? []).map((a) => a.id)
        const q = await enqueueArtistSyncJobs(db, artistIds, 'full', org.id)
        queued += q
        total += artistIds.length
        perOrg.push({
          organizationId: org.id,
          slug: org.slug,
          total: artistIds.length,
          queued: q,
        })
        break
      }
      throw new ApiError(500, 'Failed to load artists: ' + artistsError.message)
    }

    const artistIds = (artists ?? []).map((a) => a.id)
    const q = await enqueueArtistSyncJobs(db, artistIds, 'full', org.id)
    queued += q
    total += artistIds.length
    perOrg.push({
      organizationId: org.id,
      slug: org.slug,
      total: artistIds.length,
      queued: q,
    })
  }

  await recordHealthHeartbeat(db, 'sync_queue')

  return NextResponse.json({
    queued,
    total,
    organizations: perOrg.length,
    perOrg,
    message: queued + ' sync job(s) enqueued across ' + perOrg.length + ' organization(s).',
  })
})

/** Queue depth for admin polling after enqueue (does not enqueue). */
export const GET = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  await authorizeSyncRequest(request)
  const { serverEnv } = await import('@/lib/env.server')
  const db = createServiceDb(serverEnv)
  const stats = await getSyncQueueStats(db)
  return NextResponse.json(stats)
})
