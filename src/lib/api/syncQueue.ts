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

export type SyncJobType = 'full' | 'spotify' | 'discogs' | 'youtube' | 'odesli'
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

/** site_settings key for the single-flight queue executor lease. */
export const SYNC_EXECUTOR_LEASE_KEY = 'sync_executor_lease'
/** Default lease length; should cover one Vercel maxDuration budget. */
export const EXECUTOR_LEASE_MS = 5 * 60 * 1000

/** Lease payload: `ISO_EXPIRES|token` so only the owner can release. */
function encodeExecutorLease(expiresIso: string, token: string): string {
  return `${expiresIso}|${token}`
}

function parseExecutorLease(
  raw: string | null | undefined,
): { expiresAt: number; token: string | null } | null {
  if (!raw) return null
  const pipe = raw.indexOf('|')
  if (pipe === -1) {
    const expiresAt = Date.parse(raw)
    if (Number.isNaN(expiresAt)) return null
    // Legacy ISO-only values (pre-token) — treat as owned by nobody for release matching.
    return { expiresAt, token: null }
  }
  const expiresAt = Date.parse(raw.slice(0, pipe))
  if (Number.isNaN(expiresAt)) return null
  return { expiresAt, token: raw.slice(pipe + 1) || null }
}

function newExecutorLeaseToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

const ARTIST_SCOPED_JOB_TYPES: SyncJobType[] = ['full', 'spotify', 'discogs', 'youtube']

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
 * Tries to acquire a single-flight lease so only one `/api/sync` waitUntil
 * worker drains the queue at a time (avoids parallel R2/DNS storms).
 * Returns a lease token when this caller holds the lease, otherwise null.
 */
export async function tryAcquireSyncExecutorLease(
  db: DbClient,
  leaseMs = EXECUTOR_LEASE_MS,
): Promise<string | null> {
  const now = Date.now()
  const { data: existing, error: readError } = await db
    .from('site_settings')
    .select('value')
    .eq('key', SYNC_EXECUTOR_LEASE_KEY)
    .maybeSingle()

  if (readError) {
    throw new Error(`Failed to read sync executor lease: ${readError.message}`)
  }

  if (existing?.value) {
    const parsed = parseExecutorLease(existing.value)
    if (parsed && parsed.expiresAt > now) {
      return null
    }
  }

  const token = newExecutorLeaseToken()
  const expires = new Date(now + leaseMs).toISOString()
  const value = encodeExecutorLease(expires, token)

  if (existing) {
    const { data, error } = await db
      .from('site_settings')
      .update({ value })
      .eq('key', SYNC_EXECUTOR_LEASE_KEY)
      .eq('value', existing.value)
      .select('key')

    if (error) {
      throw new Error(`Failed to acquire sync executor lease: ${error.message}`)
    }
    return (data?.length ?? 0) > 0 ? token : null
  }

  const { error: insertError } = await db.from('site_settings').insert({
    key: SYNC_EXECUTOR_LEASE_KEY,
    value,
  })

  if (insertError) {
    // Concurrent insert lost the race — another executor holds the lease.
    if (insertError.code === '23505') return null
    throw new Error(`Failed to create sync executor lease: ${insertError.message}`)
  }

  return token
}

/**
 * Clears the executor lease so the next kick (or self-chain) can start a worker.
 * When `token` is provided, only the owner may release (prevents a late finally
 * from clearing a newer worker's lease after hard timeout races).
 */
export async function releaseSyncExecutorLease(
  db: DbClient,
  token?: string | null,
): Promise<void> {
  if (token) {
    const { data: existing, error: readError } = await db
      .from('site_settings')
      .select('value')
      .eq('key', SYNC_EXECUTOR_LEASE_KEY)
      .maybeSingle()

    if (readError) {
      throw new Error(`Failed to read sync executor lease: ${readError.message}`)
    }

    const parsed = parseExecutorLease(existing?.value)
    if (!parsed || parsed.token !== token) {
      // Lost ownership (expired + re-acquired by another worker) — do not clear.
      return
    }

    const { error } = await db
      .from('site_settings')
      .update({ value: encodeExecutorLease(new Date(0).toISOString(), 'released') })
      .eq('key', SYNC_EXECUTOR_LEASE_KEY)
      .eq('value', existing!.value)

    if (error) {
      throw new Error(`Failed to release sync executor lease: ${error.message}`)
    }
    return
  }

  const { error } = await db.from('site_settings').upsert(
    {
      key: SYNC_EXECUTOR_LEASE_KEY,
      value: encodeExecutorLease(new Date(0).toISOString(), 'released'),
    },
    { onConflict: 'key' },
  )
  if (error) {
    throw new Error(`Failed to release sync executor lease: ${error.message}`)
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
  if (artistIds.length === 0) return 0

  // Find artists already queued (pending or running) to avoid duplicates
  const { data: existing } = await db
    .from('sync_queue')
    .select('artist_id')
    .in('artist_id', artistIds)
    .in('status', ['pending', 'running'])
    .in('job_type', conflictingArtistJobTypes(jobType))

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
 * Enqueues a global Odesli batch job when none is already pending or running.
 */
export async function enqueueOdesliSyncJob(
  db: DbClient,
  cooldownMs = 0,
): Promise<number> {
  const { data: existing } = await db
    .from('sync_queue')
    .select('id')
    .eq('job_type', 'odesli')
    .is('artist_id', null)
    .in('status', ['pending', 'running'])
    .limit(1)

  if (existing && existing.length > 0) return 0

  const scheduledAt = new Date(Date.now() + cooldownMs).toISOString()
  const { error } = await db.from('sync_queue').insert({
    artist_id: null,
    job_type: 'odesli',
    status: 'pending',
    scheduled_at: scheduledAt,
  })

  if (error) throw new Error(`Failed to enqueue Odesli sync job: ${error.message}`)
  return 1
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

/**
 * Re-schedules a completed job when more work remains (e.g. Odesli batch).
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
 * Claim the oldest pending job by setting it to 'running'.
 * Returns null if no pending jobs are available.
 *
 * Uses a single UPDATE with RETURNING to atomically claim the job — avoids
 * race conditions when multiple cron instances run concurrently.
 */
export async function claimNextSyncJob(db: DbClient): Promise<SyncJob | null> {
  await recoverStuckSyncJobs(db)

  const now = new Date().toISOString()
  const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString()

  // Find the oldest pending job that hasn't exceeded max attempts and is due
  const { data: candidates } = await db
    .from('sync_queue')
    .select('id')
    .eq('status', 'pending')
    .lt('attempt_count', MAX_ATTEMPTS)
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(1)

  if (!candidates || candidates.length === 0) return null

  const jobId = candidates[0].id

  const { data, error } = await db
    .from('sync_queue')
    .update({
      status: 'running',
      started_at: now,
      locked_until: lockedUntil,
    })
    .eq('id', jobId)
    .eq('status', 'pending') // optimistic lock — prevent double-claim
    .select()
    .single()

  if (error || !data) return null

  // Increment attempt_count separately (Supabase PostgREST doesn't support col + 1 in update)
  await db
    .from('sync_queue')
    .update({ attempt_count: (data.attempt_count ?? 0) + 1 })
    .eq('id', jobId)

  return rowToSyncJob({
    ...data,
    attempt_count: (data.attempt_count ?? 0) + 1,
    locked_until: lockedUntil,
  })
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
    .select('id, status')
    .eq('id', jobId)
    .maybeSingle()

  if (readError) throw new Error(`Failed to load sync job: ${readError.message}`)
  if (!existing) throw new Error('Sync job not found')
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