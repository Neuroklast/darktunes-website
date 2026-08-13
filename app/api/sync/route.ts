import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  claimNextSyncJob,
  countDuePendingSyncJobs,
  isSyncJobCancelRequested,
  markSyncJobCancelled,
  markSyncJobDone,
  markSyncJobFailed,
  releaseSyncExecutorLease,
  rescheduleSyncJob,
  tryAcquireSyncExecutorLease,
  type SyncJobType,
} from '@/lib/api/syncQueue'
import { createSyncUploadFn } from '@/lib/r2Utils'
import { isValidCronSecret } from '@/lib/cronAuth'
import { waitUntil } from '@vercel/functions'
import { syncOdesliBatch, syncSingleArtist } from '@/lib/sync/syncAll'
import { RATE_LIMIT_JOB_COOLDOWN_MS, isRateLimitedSyncError } from '@/lib/sync/retryPolicy'
import { extractBearerToken, verifySyncTrigger } from '@/lib/adminAuth'
import { withErrorHandler } from '@/lib/errors'
import { recordHealthHeartbeat } from '@/lib/health/heartbeats'
import { getSyncCredentials } from '@/lib/secrets/getExternalCredentials'
import {
  revalidatePublicContent,
  RELEASE_SYNC_TAGS,
  type PublicContentTag,
} from '@/lib/sync/revalidatePublicContent'
import {
  EXECUTOR_INTER_JOB_DELAY_MS,
  EXECUTOR_LEASE_MS,
  canClaimAnotherJob,
  resolveExecutorSiteOrigin,
  selfChainSyncExecutor,
  shouldSelfChainContinuation,
  sleepMs,
} from '@/lib/sync/queueExecutor'

export const maxDuration = 300

function tagsForJobType(jobType: SyncJobType): PublicContentTag[] {
  // YouTube channel sync is a separate route; artist-scoped "youtube" jobs fall
  // through to full artist sync (releases/concerts) as a legacy fallback.
  if (jobType === 'odesli') return ['releases', 'artists']
  if (jobType === 'songkick' || jobType === 'bandsintown') return ['concerts', 'artists']
  return [...RELEASE_SYNC_TAGS]
}

async function processSyncJob(
  db: ReturnType<typeof createClient<Database>>,
  job: NonNullable<Awaited<ReturnType<typeof claimNextSyncJob>>>,
  uploadFn: ReturnType<typeof createSyncUploadFn>,
  syncCredentials: Awaited<ReturnType<typeof getSyncCredentials>>,
): Promise<PublicContentTag[]> {
  const deps = {
    db,
    fetch: globalThis.fetch,
    uploadToR2: uploadFn,
    spotify: syncCredentials.spotify,
    discogsToken: syncCredentials.discogsToken,
    songkickApiKey: syncCredentials.songkickApiKey,
    bandsintownApiKey: syncCredentials.bandsintownApiKey,
  }

  if (job.jobType === 'odesli') {
    const result = await syncOdesliBatch(deps)
    const odesliResult = result.results.find((r) => r.api === 'odesli')
    const hasMoreWork = odesliResult?.hasMoreWork ?? false

    // Odesli 429s skip the item and continue; leftover rows stay smart_url=null.
    // Never park the job for 15 minutes or abort the rest of the drain.
    if (hasMoreWork) {
      await rescheduleSyncJob(db, job.id, 0)
    } else {
      await markSyncJobDone(db, job.id)
    }

    return tagsForJobType('odesli')
  }

  if (!job.artistId) {
    await markSyncJobFailed(db, job.id, 'Job has no artist_id', job.attemptCount)
    return []
  }

  const result = await syncSingleArtist(job.artistId, job.jobType, deps)
  // Odesli rate limits must not reschedule a full/spotify/… artist job.
  const rateLimited = result.results.some((r) => r.api !== 'odesli' && r.rateLimited)

  if (rateLimited) {
    // Push this artist out of the due window; keep draining other artists.
    await rescheduleSyncJob(db, job.id, RATE_LIMIT_JOB_COOLDOWN_MS, {
      undoAttemptIncrement: true,
      currentAttemptCount: job.attemptCount,
    })
  } else {
    await markSyncJobDone(db, job.id)
  }

  return tagsForJobType(job.jobType)
}

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { serverEnv } = await import('@/lib/env.server')

  const authHeader = request.headers.get('authorization') ?? ''

  const { CRON_SECRET: cronSecret } = serverEnv
  const isCronAuthorized = Boolean(cronSecret && isValidCronSecret(authHeader, cronSecret))

  if (!isCronAuthorized) {
    const token = extractBearerToken(authHeader)
    await verifySyncTrigger(token)
  }

  const db = createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  const syncCredentials = await getSyncCredentials(db)

  // Await so health UI never loses the kick (void + early alreadyRunning return
  // previously dropped heartbeats when the isolate froze after the response).
  await recordHealthHeartbeat(db, 'sync_execute')

  // Single-flight: overlapping admin poll kicks must not spawn parallel workers.
  const leaseToken = await tryAcquireSyncExecutorLease(db, EXECUTOR_LEASE_MS)
  if (!leaseToken) {
    return NextResponse.json({ accepted: true, alreadyRunning: true, continued: false })
  }

  const uploadFn = createSyncUploadFn(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
    serverEnv.CLOUDFLARE_R2_PUBLIC_URL,
  )

  const siteOrigin = resolveExecutorSiteOrigin(request.url)
  const canSelfChain = Boolean(siteOrigin && authHeader.startsWith('Bearer '))

  waitUntil(
    (async () => {
      const startTime = Date.now()
      const tagsToRevalidate = new Set<PublicContentTag>()
      let jobsProcessed = 0
      let lastHeartbeatAt = startTime
      let shouldChain = false

      try {
        // Drain until budget headroom is gone or the due queue is empty.
        // Never start a job we cannot finish (hard kill leaves `running` zombies).
        while (canClaimAnotherJob(startTime)) {
          // Keep cron health "active" during long drains (miss window is 15m).
          if (Date.now() - lastHeartbeatAt >= 4 * 60_000) {
            await recordHealthHeartbeat(db, 'sync_execute')
            lastHeartbeatAt = Date.now()
          }

          const job = await claimNextSyncJob(db)
          if (!job) break

          // Cooperative cancel: admin sets cancel_requested_at on running jobs
          // (pending jobs are cancelled before claim). Checked between jobs only.
          if (await isSyncJobCancelRequested(db, job.id)) {
            await markSyncJobCancelled(db, job.id)
            jobsProcessed += 1
            continue
          }

          try {
            const tags = await processSyncJob(db, job, uploadFn, syncCredentials)
            // processSyncJob finalises via markSyncJobDone/rescheduleSyncJob, both
            // of which honour cancel_requested_at. Re-check so we never leave a
            // cancel request stranded if finalisation was skipped.
            if (await isSyncJobCancelRequested(db, job.id)) {
              await markSyncJobCancelled(db, job.id)
            }
            for (const tag of tags) tagsToRevalidate.add(tag)
            jobsProcessed += 1
          } catch (err) {
            if (await isSyncJobCancelRequested(db, job.id)) {
              await markSyncJobCancelled(db, job.id)
              jobsProcessed += 1
              continue
            }
            const message = err instanceof Error ? err.message : String(err)
            await markSyncJobFailed(db, job.id, message, job.attemptCount, {
              rateLimited: isRateLimitedSyncError(err),
            })
            // Still bust caches — partial writes may have landed before the throw.
            for (const tag of tagsForJobType(job.jobType)) tagsToRevalidate.add(tag)
            jobsProcessed += 1
          }

          // Pace between artists (rate limiting) without pausing the whole drain.
          if (canClaimAnotherJob(startTime) && EXECUTOR_INTER_JOB_DELAY_MS > 0) {
            await sleepMs(EXECUTOR_INTER_JOB_DELAY_MS)
          }
        }

        // Single end-of-batch revalidation is more reliable inside waitUntil than
        // revalidateTag calls scattered mid-loop (and covers path-level ISR).
        if (jobsProcessed > 0 && tagsToRevalidate.size > 0) {
          revalidatePublicContent([...tagsToRevalidate])
        }

        if (canSelfChain) {
          const duePending = await countDuePendingSyncJobs(db)
          shouldChain = shouldSelfChainContinuation({ jobsProcessed, duePending })
        }
      } finally {
        try {
          await recordHealthHeartbeat(db, 'sync_execute')
        } catch (hbErr) {
          console.error('[sync] failed to refresh executor heartbeat:', hbErr)
        }
        try {
          await releaseSyncExecutorLease(db, leaseToken)
        } catch (leaseErr) {
          console.error('[sync] failed to release executor lease:', leaseErr)
        }
      }

      // Self-chain only after the lease is free so the next isolate can acquire it.
      // Continues the same logical "run" across Vercel duration slices until the
      // due queue is empty (rate-limited jobs stay out of the due window).
      if (shouldChain && siteOrigin) {
        try {
          await sleepMs(250)
          await selfChainSyncExecutor({
            origin: siteOrigin,
            authorizationHeader: authHeader,
          })
        } catch (chainErr) {
          console.error('[sync] self-chain kick failed (cron will retry):', chainErr)
        }
      }
    })(),
  )

  return NextResponse.json({ accepted: true, alreadyRunning: false, continued: false })
})

export const GET = POST
