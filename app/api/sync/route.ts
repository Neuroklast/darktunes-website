import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  acquireSyncWorkerLease,
  claimSyncJobs,
  finishSyncRun,
  isSyncJobCancelRequested,
  markSyncJobCancelled,
  markSyncJobDone,
  markSyncJobFailed,
  newWorkerLeaseToken,
  recordCronTick,
  releaseSyncWorkerLease,
  renewSyncWorkerLease,
  rescheduleSyncJob,
  startSyncRun,
  WORKER_LEASE_TTL_MS,
  type SyncJob,
  type SyncJobType,
  type SyncRunTrigger,
} from '@/lib/api/syncQueue'
import { createSyncUploadFn } from '@/lib/r2Utils'
import { isValidCronSecret } from '@/lib/cronAuth'
import { waitUntil } from '@vercel/functions'
import { syncSingleArtist } from '@/lib/sync/syncAll'
import { RATE_LIMIT_JOB_COOLDOWN_MS, isRateLimitedSyncError } from '@/lib/sync/retryPolicy'
import { extractBearerToken, verifySyncTrigger } from '@/lib/adminAuth'
import { withErrorHandler } from '@/lib/errors'
import { getSyncCredentials } from '@/lib/secrets/getExternalCredentials'
import { publishScheduledNewsPosts } from '@/lib/api/news'
import {
  revalidatePublicContent,
  RELEASE_SYNC_TAGS,
  type PublicContentTag,
} from '@/lib/sync/revalidatePublicContent'
import {
  EXECUTOR_INTER_JOB_DELAY_MS,
  canClaimAnotherJob,
  sleepMs,
} from '@/lib/sync/queueExecutor'

export const maxDuration = 300

/** Renew the worker lease at most every 30s (TTL is 90s). */
const LEASE_RENEW_INTERVAL_MS = 30_000

function tagsForJobType(jobType: SyncJobType): PublicContentTag[] {
  // YouTube channel sync is a separate route; artist-scoped "youtube" jobs fall
  // through to full artist sync (releases/concerts) as a legacy fallback.
  if (jobType === 'songkick' || jobType === 'bandsintown') return ['concerts', 'artists']
  return [...RELEASE_SYNC_TAGS]
}

async function processSyncJob(
  db: ReturnType<typeof createClient<Database>>,
  job: SyncJob,
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

  if (!job.artistId) {
    await markSyncJobFailed(db, job.id, 'Job has no artist_id', job.attemptCount)
    return []
  }

  const result = await syncSingleArtist(job.artistId, job.jobType, deps)
  const rateLimited = result.results.some((r) => r.rateLimited)

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

  let trigger: SyncRunTrigger = 'admin'
  if (isCronAuthorized) {
    trigger = 'cron'
  } else {
    const token = extractBearerToken(authHeader)
    await verifySyncTrigger(token)
  }
  if (request.headers.get('x-sync-self-chain') === '1') {
    trigger = 'self-chain'
  }

  const db = createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  // The public anon client cannot update news. This tick already has the service role.
  await publishScheduledNewsPosts(db).catch((err) => {
    console.error('[sync] scheduled news publish failed:', err)
  })

  // Dead-man's switch: proves the HTTP hop reached Next.js (written before any
  // lease/claim so a 401 or crash upstream is distinguishable from a dead worker).
  await recordCronTick(db, 'worker', 'ok')

  // Single-flight: overlapping cron ticks / admin kicks must not spawn parallel
  // workers. Atomic in Postgres with a TTL, so a hard-killed worker recovers.
  const leaseToken = newWorkerLeaseToken()
  const acquired = await acquireSyncWorkerLease(db, leaseToken, WORKER_LEASE_TTL_MS)
  if (!acquired) {
    await recordCronTick(db, 'worker', 'already_running')
    return NextResponse.json({ accepted: true, alreadyRunning: true, processed: 0 })
  }

  const runId = await startSyncRun(db, trigger)

  const uploadFn = createSyncUploadFn(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
    serverEnv.CLOUDFLARE_R2_PUBLIC_URL,
  )

  waitUntil(
    (async () => {
      const startTime = Date.now()
      const tagsToRevalidate = new Set<PublicContentTag>()
      let lastLeaseRenewAt = startTime
      let claimed = 0
      let completed = 0
      let failed = 0
      let runError: string | null = null
      let syncCredentialsPromise: ReturnType<typeof getSyncCredentials> | null = null

      try {
        // Drain until budget headroom is gone or the due queue is empty.
        // One job at a time so we never start work we cannot finish.
        while (canClaimAnotherJob(startTime)) {
          if (Date.now() - lastLeaseRenewAt >= LEASE_RENEW_INTERVAL_MS) {
            const renewed = await renewSyncWorkerLease(db, leaseToken, WORKER_LEASE_TTL_MS)
            if (!renewed) {
              runError = 'Worker lease lost mid-drain'
              break
            }
            lastLeaseRenewAt = Date.now()
          }

          const [job] = await claimSyncJobs(db, 1)
          if (!job) break

          claimed += 1

          // Retire legacy jobs without querying the defunct provider or credentials.
          if (job.jobType === 'odesli') {
            await markSyncJobDone(db, job.id)
            completed += 1
            continue
          }

          // Cooperative cancel: admin sets cancel_requested_at on running jobs
          // (pending jobs are cancelled before claim). Checked between jobs only.
          if (await isSyncJobCancelRequested(db, job.id)) {
            await markSyncJobCancelled(db, job.id)
            continue
          }

          try {
            // Do not read credentials for idle or already-cancelled sync ticks.
            // Reuse one request for all jobs claimed by this worker invocation.
            syncCredentialsPromise ??= getSyncCredentials(db)
            const credentials = await syncCredentialsPromise.catch((error) => {
              syncCredentialsPromise = null
              throw error
            })
            const tags = await processSyncJob(db, job, uploadFn, credentials)
            // processSyncJob finalises via markSyncJobDone/rescheduleSyncJob, both
            // of which honour cancel_requested_at. Re-check so we never leave a
            // cancel request stranded if finalisation was skipped.
            if (await isSyncJobCancelRequested(db, job.id)) {
              await markSyncJobCancelled(db, job.id)
            }
            for (const tag of tags) tagsToRevalidate.add(tag)
            completed += 1
          } catch (err) {
            if (await isSyncJobCancelRequested(db, job.id)) {
              await markSyncJobCancelled(db, job.id)
              completed += 1
              continue
            }
            const message = err instanceof Error ? err.message : String(err)
            await markSyncJobFailed(db, job.id, message, job.attemptCount, {
              rateLimited: isRateLimitedSyncError(err),
            })
            // Still bust caches — partial writes may have landed before the throw.
            for (const tag of tagsForJobType(job.jobType)) tagsToRevalidate.add(tag)
            failed += 1
          }

          // Pace between artists (rate limiting) without pausing the whole drain.
          if (canClaimAnotherJob(startTime) && EXECUTOR_INTER_JOB_DELAY_MS > 0) {
            await sleepMs(EXECUTOR_INTER_JOB_DELAY_MS)
          }
        }

        // Single end-of-batch revalidation is more reliable than revalidateTag
        // calls scattered mid-loop (and covers path-level ISR).
        if (claimed > 0 && tagsToRevalidate.size > 0) {
          revalidatePublicContent([...tagsToRevalidate])
        }
      } catch (err) {
        runError = err instanceof Error ? err.message : String(err)
        console.error('[sync] worker drain failed:', err)
      } finally {
        // 'partial' keeps a run with some failed jobs from reading as a clean success.
        const runStatus = runError ? 'error' : failed > 0 ? 'partial' : 'ok'
        await finishSyncRun(db, runId, {
          status: runStatus,
          claimed,
          completed,
          failed,
          error: runError,
        })
        await recordCronTick(db, 'worker', runStatus, runError ?? undefined)
        try {
          await releaseSyncWorkerLease(db, leaseToken)
        } catch (leaseErr) {
          console.error('[sync] failed to release worker lease:', leaseErr)
        }
      }
    })(),
  )

  return NextResponse.json({ accepted: true, alreadyRunning: false })
})

export const GET = POST
