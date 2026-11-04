/**
 * src/lib/api/syncQueue.ts — Sync Queue DAL
 *
 * Provides read/write access to the sync_queue table.
 *
 * The sync queue decouples triggering a sync (POST /api/sync/queue) from the actual
 * processing, so syncing many artists never exceeds Vercel's timeout limits.
 * Each job processes one artist via POST /api/sync (Supabase Cron: every 5 minutes).
 *
 * Job lifecycle:
 *   pending → running → done
 *                     → failed (attempt_count incremented, re-queued up to 3×)
 *                     → cancelled (admin cancel; running uses cancel_requested_at)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { RATE_LIMIT_JOB_COOLDOWN_MS } from '@/lib/sync/retryPolicy'

type DbClient = SupabaseClient<Database>
type SyncQueueRow = Database['public']['Tables']['sync_queue']['Row']

export type SyncJobType =
  | 'full'
  | 'spotify'
  | 'discogs'
  | 'youtube'
  | 'odesli' // Historical queue rows only; never enqueued or executed.
  | 'songkick'
  | 'bandsintown'
export type SyncJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'

export interface SyncJob {
  id: string
  artistId: string | null
  artistName: string | null
  jobType: SyncJobType
  status: SyncJobStatus
  scheduledAt: string
  startedAt: string | null
  finishedAt: string | null
  lockedUntil: string | null
  cancelRequestedAt: string | null
  cancelledAt: string | null
  errorMessage: string | null
  attemptCount: number
  createdAt: string
}

export const MAX_ATTEMPTS = 3
/**
 * Visibility timeout — running jobs past this are reset to pending.
 * Slightly above Vercel maxDuration (300s) so a live job is not stolen mid-run,
 * but short enough that a hard-killed waitUntil recovers without a 10m hang.
 */
export const LOCK_DURATION_MS = 6 * 60 * 1000

/**
 * Default worker lease TTL (ms). Must exceed the worker tick budget so the
 * owner always finishes (and releases) before another worker can take over.
 */
export const WORKER_LEASE_TTL_MS = 90_000

/** Owner token so a stale worker cannot release a newer worker's lease. */
export function newWorkerLeaseToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

const ARTIST_SCOPED_JOB_TYPES: SyncJobType[] = [
  'full',
  'spotify',
  'discogs',
  'youtube',
  'songkick',
  'bandsintown',
]

/** Job types that block enqueueing the same artist for `jobType`. */
export function conflictingArtistJobTypes(jobType: SyncJobType): SyncJobType[] {
  switch (jobType) {
    case 'full':
      return ARTIST_SCOPED_JOB_TYPES
    case 'spotify':
      return ['full', 'spotify']
    case 'discogs':
      return ['full', 'discogs']
    case 'youtube':
      return ['full', 'youtube']
    case 'songkick':
      return ['full', 'songkick']
    case 'bandsintown':
      return ['full', 'bandsintown']
    default:
      return [jobType]
  }
}

function rowToSyncJob(
  row: SyncQueueRow,
  artistName: string | null = null,
): SyncJob {
  return {
    id: row.id,
    artistId: row.artist_id ?? null,
    artistName,
    jobType: (row.job_type as SyncJobType) ?? 'full',
    status: row.status as SyncJobStatus,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    lockedUntil: row.locked_until ?? null,
    cancelRequestedAt: row.cancel_requested_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    errorMessage: row.error_message ?? null,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
  }
}

/**
 * Tries to acquire the single-flight worker lease so only one `/api/sync`
 * worker drains the queue at a time. Atomic in Postgres (`FOR UPDATE`), with a
 * TTL so a hard-killed worker is recovered automatically. Returns true when
 * this caller holds the lease.
 */
export async function acquireSyncWorkerLease(
  db: DbClient,
  token: string,
  ttlMs = WORKER_LEASE_TTL_MS,
): Promise<boolean> {
  const { data, error } = await db.rpc('acquire_sync_worker_lease', {
    p_token: token,
    p_ttl_ms: ttlMs,
  })

  if (error) {
    throw new Error(`Failed to acquire sync worker lease: ${error.message}`)
  }
  return data === true
}

/** Extends the lease for the current owner. Returns false if ownership was lost. */
export async function renewSyncWorkerLease(
  db: DbClient,
  token: string,
  ttlMs = WORKER_LEASE_TTL_MS,
): Promise<boolean> {
  const { data, error } = await db.rpc('renew_sync_worker_lease', {
    p_token: token,
    p_ttl_ms: ttlMs,
  })

  if (error) {
    throw new Error(`Failed to renew sync worker lease: ${error.message}`)
  }
  return data === true
}

/** Releases the lease; only the owner token may clear it. */
export async function releaseSyncWorkerLease(db: DbClient, token: string): Promise<void> {
  const { error } = await db.rpc('release_sync_worker_lease', { p_token: token })
  if (error) {
    throw new Error(`Failed to release sync worker lease: ${error.message}`)
  }
}

/**
 * Atomically claim up to `qty` due jobs. Uses the `claim_sync_jobs` Postgres
 * function (`FOR UPDATE SKIP LOCKED`), so concurrent workers never double-claim.
 */
export async function claimSyncJobs(db: DbClient, qty = 1): Promise<SyncJob[]> {
  const { data, error } = await db.rpc('claim_sync_jobs', { p_qty: qty })

  if (error) {
    throw new Error(`Failed to claim sync jobs: ${error.message}`)
  }
  return (data ?? []).map((row) => rowToSyncJob(row as SyncQueueRow))
}

// ---------------------------------------------------------------------------
// Run ledger + dead-man's-switch ticks
// ---------------------------------------------------------------------------

export type CronTickKind = 'scheduler' | 'worker'
export type SyncRunTrigger = 'cron' | 'admin' | 'self-chain' | 'enqueue-kick'

/** Records a liveness tick. Non-fatal — telemetry must never break the worker. */
export async function recordCronTick(
  db: DbClient,
  kind: CronTickKind,
  status: string,
  detail?: string,
): Promise<void> {
  const { error } = await db
    .from('cron_ticks')
    .insert({ kind, status, detail: detail ?? null })

  if (error) {
    console.warn(`[syncQueue] recordCronTick(${kind}) failed:`, error.message)
  }
}

/** Opens a run ledger row. Returns the run id, or null when telemetry fails. */
export async function startSyncRun(
  db: DbClient,
  trigger: SyncRunTrigger,
): Promise<string | null> {
  const { data, error } = await db
    .from('sync_runs')
    .insert({ trigger, status: 'ok' })
    .select('id')
    .maybeSingle()

  if (error) {
    console.warn('[syncQueue] startSyncRun failed:', error.message)
    return null
  }
  return data?.id ?? null
}

/** Finalises a run ledger row. Non-fatal. */
export async function finishSyncRun(
  db: DbClient,
  runId: string | null,
  patch: {
    status: string
    claimed?: number
    completed?: number
    failed?: number
    error?: string | null
  },
): Promise<void> {
  if (!runId) return
  const { error } = await db
    .from('sync_runs')
    .update({
      status: patch.status,
      claimed: patch.claimed ?? 0,
      completed: patch.completed ?? 0,
      failed: patch.failed ?? 0,
      error: patch.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (error) {
    console.warn('[syncQueue] finishSyncRun failed:', error.message)
  }
}

/**
 * Resets jobs stuck in `running` past their visibility timeout back to `pending`.
 * Returns the number of jobs recovered.
 */
export async function recoverStuckSyncJobs(db: DbClient): Promise<number> {
  const now = new Date().toISOString()
  const staleStartedBefore = new Date(Date.now() - LOCK_DURATION_MS).toISOString()

  const { data, error } = await db
    .from('sync_queue')
    .update({
      status: 'pending',
      locked_until: null,
      started_at: null,
    })
    .eq('status', 'running')
    .or(`locked_until.lt.${now},and(locked_until.is.null,started_at.lt.${staleStartedBefore})`)
    .select('id')

  if (error) throw new Error(`Failed to recover stuck sync jobs: ${error.message}`)
  return data?.length ?? 0
}

/**
 * Re-queues permanently failed jobs so an admin can retry them manually.
 * Returns the number of jobs re-queued.
 */
export async function requeueFailedSyncJobs(db: DbClient): Promise<number> {
  const { data, error } = await db
    .from('sync_queue')
    .update({
      status: 'pending',
      scheduled_at: new Date().toISOString(),
      finished_at: null,
      locked_until: null,
      started_at: null,
      error_message: null,
    })
    .eq('status', 'failed')
    .select('id')

  if (error) throw new Error(`Failed to requeue failed sync jobs: ${error.message}`)
  return data?.length ?? 0
}

/**
 * Enqueue sync jobs for all artists.
 * Skips artists that already have a pending or running job to avoid duplicates.
 * Returns the number of jobs enqueued.
 */
export async function enqueueArtistSyncJobs(
  db: DbClient,
  artistIds: string[],
  jobType: SyncJobType = 'full',
): Promise<number> {
  if (jobType === 'odesli') throw new Error('Retired sync provider cannot be enqueued')
  if (artistIds.length === 0) return 0

  // Find artists already queued (pending or running) to avoid duplicates
  const { data: existing, error: existingError } = await db
    .from('sync_queue')
    .select('artist_id')
    .in('artist_id', artistIds)
    .in('status', ['pending', 'running'])
    .in('job_type', conflictingArtistJobTypes(jobType))

  if (existingError) {
    throw new Error(`Failed to read existing sync jobs: ${existingError.message}`)
  }

  const alreadyQueued = new Set((existing ?? []).map((r) => r.artist_id))
  const toEnqueue = artistIds.filter((id) => !alreadyQueued.has(id))

  if (toEnqueue.length === 0) return 0

  const jobs = toEnqueue.map((artistId) => ({
    artist_id: artistId,
    job_type: jobType,
    status: 'pending' as const,
  }))

  const { error } = await db.from('sync_queue').insert(jobs)
  if (error) throw new Error(`Failed to enqueue sync jobs: ${error.message}`)

  return toEnqueue.length
}

/**
 * Enqueues Spotify sync jobs for artists with a spotify_id.
 */
export async function enqueueSpotifySyncJobs(db: DbClient): Promise<number> {
  const { data: artists, error } = await db
    .from('artists')
    .select('id')
    .not('spotify_id', 'is', null)

  if (error) throw new Error(`Failed to load artists for Spotify queue: ${error.message}`)
  const artistIds = (artists ?? []).map((a) => a.id)
  return enqueueArtistSyncJobs(db, artistIds, 'spotify')
}

export async function enqueueSongkickSyncJobs(db: DbClient): Promise<number> {
  const { data: artists, error } = await db
    .from('artists')
    .select('id')
    .not('songkick_id', 'is', null)

  if (error) throw new Error(`Failed to load artists for Songkick queue: ${error.message}`)
  const artistIds = (artists ?? []).map((a) => a.id)
  return enqueueArtistSyncJobs(db, artistIds, 'songkick')
}

export async function enqueueBandsintownSyncJobs(db: DbClient): Promise<number> {
  const { data: artists, error } = await db
    .from('artists')
    .select('id')
    .not('bandsintown_id', 'is', null)

  if (error) throw new Error(`Failed to load artists for Bandsintown queue: ${error.message}`)
  const artistIds = (artists ?? []).map((a) => a.id)
  return enqueueArtistSyncJobs(db, artistIds, 'bandsintown')
}

/**
 * Re-schedules a completed job when more work remains.
 * Honours admin cancel requests set while the job was running.
 */
export async function rescheduleSyncJob(
  db: DbClient,
  jobId: string,
  cooldownMs: number,
  options?: { undoAttemptIncrement?: boolean; currentAttemptCount?: number },
): Promise<void> {
  if (await isSyncJobCancelRequested(db, jobId)) {
    await markSyncJobCancelled(db, jobId)
    return
  }

  const scheduledAt = new Date(Date.now() + cooldownMs).toISOString()
  const attemptCount =
    options?.undoAttemptIncrement && options.currentAttemptCount !== undefined
      ? Math.max(0, options.currentAttemptCount - 1)
      : undefined

  const { error } = await db
    .from('sync_queue')
    .update({
      status: 'pending',
      scheduled_at: scheduledAt,
      finished_at: null,
      locked_until: null,
      started_at: null,
      error_message: null,
      ...(attemptCount !== undefined ? { attempt_count: attemptCount } : {}),
    })
    .eq('id', jobId)

  if (error) throw new Error(`Failed to reschedule sync job: ${error.message}`)
}

/**
 * True when the job was cancelled or an admin requested cancel while running.
 */
export async function isSyncJobCancelRequested(
  db: DbClient,
  jobId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('sync_queue')
    .select('status, cancel_requested_at')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw new Error(`Failed to read cancel state: ${error.message}`)
  if (!data) return true
  return data.status === 'cancelled' || data.cancel_requested_at != null
}

/**
 * Cancel a pending job immediately, or request cancel for a running job.
 * Returns the resulting status label for UI feedback.
 *
 * Running jobs are cooperative: we set `cancel_requested_at` and the executor
 * finalises as cancelled instead of done/reschedule when the current unit of
 * work finishes (or before starting the next claim).
 */
export async function cancelSyncJob(
  db: DbClient,
  jobId: string,
): Promise<'cancelled' | 'cancel_requested' | 'noop'> {
  const { data: existing, error: readError } = await db
    .from('sync_queue')
    .select('id, status, cancel_requested_at')
    .eq('id', jobId)
    .maybeSingle()

  if (readError) throw new Error(`Failed to load sync job: ${readError.message}`)
  if (!existing) throw new Error('Sync job not found')

  if (existing.status === 'cancelled') return 'noop'
  if (existing.status === 'done' || existing.status === 'failed') return 'noop'

  const now = new Date().toISOString()

  if (existing.status === 'pending') {
    const { data: cancelledRow, error } = await db
      .from('sync_queue')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        finished_at: now,
        locked_until: null,
        started_at: null,
        cancel_requested_at: now,
        error_message: 'Cancelled by admin',
      })
      .eq('id', jobId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (error) throw new Error(`Failed to cancel sync job: ${error.message}`)
    if (cancelledRow) return 'cancelled'

    // Race: job was claimed between read and update — fall through to running path
  }

  // running (or just claimed) — cooperative cancel
  if (existing.status === 'running' || existing.status === 'pending') {
    const { data: current, error: reReadError } = await db
      .from('sync_queue')
      .select('id, status, cancel_requested_at')
      .eq('id', jobId)
      .maybeSingle()

    if (reReadError) throw new Error(`Failed to load sync job: ${reReadError.message}`)
    if (!current) throw new Error('Sync job not found')
    if (current.status === 'cancelled') return 'cancelled'
    if (current.status === 'done' || current.status === 'failed') return 'noop'
    if (current.cancel_requested_at) return 'cancel_requested'

    if (current.status === 'pending') {
      // Rare: still pending after lost race above — try cancel once more
      const { data: secondTry, error: secondErr } = await db
        .from('sync_queue')
        .update({
          status: 'cancelled',
          cancelled_at: now,
          finished_at: now,
          locked_until: null,
          started_at: null,
          cancel_requested_at: now,
          error_message: 'Cancelled by admin',
        })
        .eq('id', jobId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (secondErr) throw new Error(`Failed to cancel sync job: ${secondErr.message}`)
      if (secondTry) return 'cancelled'
    }

    const { data: requested, error } = await db
      .from('sync_queue')
      .update({
        cancel_requested_at: now,
        error_message: 'Cancel requested by admin',
      })
      .eq('id', jobId)
      .eq('status', 'running')
      .select('id')
      .maybeSingle()

    if (error) throw new Error(`Failed to request cancel: ${error.message}`)
    if (requested) return 'cancel_requested'
    return 'noop'
  }

  return 'noop'
}

/** Finalize a running job that observed cancel_requested_at. */
export async function markSyncJobCancelled(db: DbClient, jobId: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from('sync_queue')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      finished_at: now,
      locked_until: null,
      error_message: 'Cancelled by admin',
    })
    .eq('id', jobId)

  if (error) throw new Error(`Failed to mark job cancelled: ${error.message}`)
}

/**
 * Re-queue a failed or cancelled job for another attempt.
 */
export async function retrySyncJob(db: DbClient, jobId: string): Promise<boolean> {
  const { data: existing, error: readError } = await db
    .from('sync_queue')
    .select('id, status, job_type')
    .eq('id', jobId)
    .maybeSingle()

  if (readError) throw new Error(`Failed to load sync job: ${readError.message}`)
  if (!existing) throw new Error('Sync job not found')
  if (existing.job_type === 'odesli') return false
  if (existing.status !== 'failed' && existing.status !== 'cancelled') return false

  const { error } = await db
    .from('sync_queue')
    .update({
      status: 'pending',
      scheduled_at: new Date().toISOString(),
      finished_at: null,
      locked_until: null,
      started_at: null,
      cancel_requested_at: null,
      cancelled_at: null,
      error_message: null,
      attempt_count: 0,
    })
    .eq('id', jobId)
    .in('status', ['failed', 'cancelled'])

  if (error) throw new Error(`Failed to retry sync job: ${error.message}`)
  return true
}

export interface ListSyncJobsOptions {
  status?: SyncJobStatus | SyncJobStatus[]
  jobType?: SyncJobType
  limit?: number
}

/**
 * Recent queue jobs for the Advanced admin console (with artist name when set).
 *
 * Uses `select('*')` + a separate artists lookup so listing still works when:
 * - cancel columns are not yet applied on an older production DB
 * - PostgREST embed `artists(name)` fails (relationship / schema-cache issues)
 */
export async function listSyncJobs(
  db: DbClient,
  options: ListSyncJobsOptions = {},
): Promise<SyncJob[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)

  let query = db
    .from('sync_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status]
    query = query.in('status', statuses)
  }
  if (options.jobType) {
    query = query.eq('job_type', options.jobType)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to list sync jobs: ${error.message}`)

  const rows = (data ?? []) as SyncQueueRow[]
  const artistIds = [
    ...new Set(rows.map((r) => r.artist_id).filter((id): id is string => Boolean(id))),
  ]

  const nameById = new Map<string, string>()
  if (artistIds.length > 0) {
    const { data: artists, error: artistsError } = await db
      .from('artists')
      .select('id, name')
      .in('id', artistIds)

    if (artistsError) {
      // Non-fatal: jobs still list without names
      console.warn('[listSyncJobs] artist name lookup failed:', artistsError.message)
    } else {
      for (const artist of artists ?? []) {
        nameById.set(artist.id, artist.name)
      }
    }
  }

  return rows.map((row) =>
    rowToSyncJob(row, row.artist_id ? (nameById.get(row.artist_id) ?? null) : null),
  )
}

/**
 * Mark a job as done.
 * If an admin requested cancel while the job was running, finalise as cancelled
 * instead — otherwise cancel appears to "do nothing" after a long sync finishes.
 */
export async function markSyncJobDone(db: DbClient, jobId: string): Promise<void> {
  if (await isSyncJobCancelRequested(db, jobId)) {
    await markSyncJobCancelled(db, jobId)
    return
  }

  const { error } = await db
    .from('sync_queue')
    .update({
      status: 'done',
      finished_at: new Date().toISOString(),
      locked_until: null,
    })
    .eq('id', jobId)

  if (error) throw new Error(`Failed to mark job done: ${error.message}`)
}

/**
 * Mark a job as failed with an error message.
 * If attempt_count < MAX_ATTEMPTS, resets status to 'pending' with exponential
 * backoff (scheduled_at is pushed forward) so the cron retries it.
 */
export async function markSyncJobFailed(
  db: DbClient,
  jobId: string,
  errorMessage: string,
  currentAttemptCount: number,
  options?: { rateLimited?: boolean },
): Promise<void> {
  if (await isSyncJobCancelRequested(db, jobId)) {
    await markSyncJobCancelled(db, jobId)
    return
  }

  const rateLimited = options?.rateLimited ?? false
  const willRetry = rateLimited || currentAttemptCount < MAX_ATTEMPTS

  const delayMs = rateLimited
    ? RATE_LIMIT_JOB_COOLDOWN_MS
    : Math.pow(2, currentAttemptCount) * 60 * 1000
  const scheduledAt = new Date(Date.now() + delayMs).toISOString()
  const attemptCount = rateLimited
    ? Math.max(0, currentAttemptCount - 1)
    : undefined

  const { error } = await db
    .from('sync_queue')
    .update({
      status: willRetry ? 'pending' : 'failed',
      finished_at: willRetry ? null : new Date().toISOString(),
      error_message: rateLimited ? 'Rate limited — rescheduled' : errorMessage,
      locked_until: null,
      ...(willRetry
        ? {
            scheduled_at: scheduledAt,
            started_at: null,
            ...(attemptCount !== undefined ? { attempt_count: attemptCount } : {}),
          }
        : {}),
    })
    .eq('id', jobId)

  if (error) throw new Error(`Failed to mark job failed: ${error.message}`)
}

/**
 * Get recent queue status for the Admin Health dashboard.
 */
/**
 * Counts running jobs whose visibility timeout has expired (stuck / zombie jobs).
 */
export async function countStuckSyncJobs(db: DbClient): Promise<number> {
  const now = new Date().toISOString()
  const staleStartedBefore = new Date(Date.now() - LOCK_DURATION_MS).toISOString()

  const { data, error } = await db
    .from('sync_queue')
    .select('id')
    .eq('status', 'running')
    .or(`locked_until.lt.${now},and(locked_until.is.null,started_at.lt.${staleStartedBefore})`)

  if (error) throw new Error(`Failed to count stuck sync jobs: ${error.message}`)
  return data?.length ?? 0
}

async function countSyncQueueByStatus(
  db: DbClient,
  status: SyncJobStatus,
  createdSince?: string,
): Promise<number> {
  let query = db
    .from('sync_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', status)

  if (createdSince) {
    query = query.gte('created_at', createdSince)
  }

  const { count, error } = await query

  if (error) {
    throw new Error(`Failed to count sync queue (${status}): ${error.message}`)
  }
  return count ?? 0
}

/**
 * Pending jobs that are due now (scheduled_at <= now, under max attempts).
 * Used to decide self-chain continuation after a budget-limited drain.
 */
export async function countDuePendingSyncJobs(db: DbClient): Promise<number> {
  const now = new Date().toISOString()
  const { count, error } = await db
    .from('sync_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('attempt_count', MAX_ATTEMPTS)
    .lte('scheduled_at', now)

  if (error) {
    throw new Error(`Failed to count due pending sync jobs: ${error.message}`)
  }
  return count ?? 0
}

export async function getSyncQueueStats(
  db: DbClient,
): Promise<{ pending: number; running: number; done: number; failed: number }> {
  // Unstick zombies before reporting so admin polls + waitForSyncQueueIdle can
  // re-kick instead of waiting forever on a dead `running` row.
  // Non-fatal: stats must still load if recovery fails (permissions / schema lag).
  try {
    await recoverStuckSyncJobs(db)
  } catch (err) {
    console.warn(
      '[syncQueue] recoverStuckSyncJobs during stats failed:',
      err instanceof Error ? err.message : err,
    )
  }

  const createdSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [pending, running, done, failed] = await Promise.all([
    countSyncQueueByStatus(db, 'pending'),
    countSyncQueueByStatus(db, 'running'),
    countSyncQueueByStatus(db, 'done', createdSince),
    countSyncQueueByStatus(db, 'failed', createdSince),
  ])

  return { pending, running, done, failed }
}

/**
 * Get recent sync jobs for display in the Admin Health tab.
 */
export async function getRecentSyncJobs(db: DbClient, limit = 20): Promise<SyncJob[]> {
  const { data, error } = await db
    .from('sync_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to get sync jobs: ${error.message}`)
  return (data ?? []).map((row) => rowToSyncJob(row))
}