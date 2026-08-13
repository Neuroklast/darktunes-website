import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  recoverStuckSyncJobs,
  requeueFailedSyncJobs,
  enqueueArtistSyncJobs,
  markSyncJobFailed,
  markSyncJobDone,
  countStuckSyncJobs,
  conflictingArtistJobTypes,
  getSyncQueueStats,
  tryAcquireSyncExecutorLease,
  releaseSyncExecutorLease,
  cancelSyncJob,
  retrySyncJob,
  listSyncJobs,
  SYNC_EXECUTOR_LEASE_KEY,
  MAX_ATTEMPTS,
} from './syncQueue'

type DbClient = SupabaseClient<Database>
function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    gte: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeSequentialMockDb(calls: Array<{ data: unknown; error?: unknown }>): DbClient {
  let callIndex = 0
  return {
    from: vi.fn().mockImplementation(() => {
      const call = calls[callIndex] ?? { data: null, error: null }
      callIndex++
      return makeBuilder(call.data, call.error ?? null)
    }),
  } as unknown as DbClient
}

describe('tryAcquireSyncExecutorLease', () => {
  it('acquires when no lease row exists', async () => {
    const db = makeSequentialMockDb([{ data: null }, { data: null }])
    const token = await tryAcquireSyncExecutorLease(db, 60_000)
    expect(token).toEqual(expect.any(String))
    expect(token!.length).toBeGreaterThan(4)
    expect(db.from).toHaveBeenCalledWith('site_settings')
  })

  it('returns null when lease is still valid', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const db = makeSequentialMockDb([{ data: { value: `${future}|other-token` } }])
    await expect(tryAcquireSyncExecutorLease(db, 60_000)).resolves.toBeNull()
  })

  it('acquires when lease is expired via optimistic update', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const db = makeSequentialMockDb([
      { data: { value: `${past}|old` } },
      { data: [{ key: SYNC_EXECUTOR_LEASE_KEY }] },
    ])
    const token = await tryAcquireSyncExecutorLease(db, 60_000)
    expect(token).toEqual(expect.any(String))
  })
})

describe('releaseSyncExecutorLease', () => {
  it('upserts expired lease value without token', async () => {
    const db = makeSequentialMockDb([{ data: null }])
    await expect(releaseSyncExecutorLease(db)).resolves.toBeUndefined()
    expect(db.from).toHaveBeenCalledWith('site_settings')
  })

  it('no-ops when token does not own the lease', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const db = makeSequentialMockDb([{ data: { value: `${future}|owner-a` } }])
    await expect(releaseSyncExecutorLease(db, 'owner-b')).resolves.toBeUndefined()
    // Only the read path — no update when ownership mismatches
    expect(db.from).toHaveBeenCalledTimes(1)
  })
})

describe('countStuckSyncJobs', () => {
  it('returns the number of stuck running jobs', async () => {
    const db = makeSequentialMockDb([{ data: [{ id: 'job-9' }] }])
    const count = await countStuckSyncJobs(db)
    expect(count).toBe(1)
  })
})

describe('recoverStuckSyncJobs', () => {
  it('returns the number of recovered jobs', async () => {
    const db = makeSequentialMockDb([{ data: [{ id: 'job-1' }, { id: 'job-2' }] }])
    const count = await recoverStuckSyncJobs(db)
    expect(count).toBe(2)
  })

  it('throws when Supabase returns an error', async () => {
    const db = makeSequentialMockDb([{ data: null, error: { message: 'update failed' } }])
    await expect(recoverStuckSyncJobs(db)).rejects.toThrow('Failed to recover stuck sync jobs')
  })
})

describe('requeueFailedSyncJobs', () => {
  it('returns the number of re-queued jobs', async () => {
    const db = makeSequentialMockDb([{ data: [{ id: 'job-3' }] }])
    const count = await requeueFailedSyncJobs(db)
    expect(count).toBe(1)
  })
})

describe('conflictingArtistJobTypes', () => {
  it('treats full jobs as blocking any artist-scoped sync', () => {
    expect(conflictingArtistJobTypes('full')).toEqual([
      'full',
      'spotify',
      'discogs',
      'youtube',
      'songkick',
      'bandsintown',
    ])
  })

  it('allows spotify enqueue when only discogs is pending', () => {
    expect(conflictingArtistJobTypes('spotify')).toEqual(['full', 'spotify'])
    expect(conflictingArtistJobTypes('spotify')).not.toContain('discogs')
  })

  it('treats songkick and bandsintown as artist-scoped concert jobs', () => {
    expect(conflictingArtistJobTypes('songkick')).toEqual(['full', 'songkick'])
    expect(conflictingArtistJobTypes('bandsintown')).toEqual(['full', 'bandsintown'])
  })
})

describe('enqueueArtistSyncJobs', () => {
  it('skips artists that already have pending or running jobs', async () => {
    const db = makeSequentialMockDb([
      { data: [{ artist_id: 'artist-1' }] },
      { data: null },
    ])
    const count = await enqueueArtistSyncJobs(db, ['artist-1', 'artist-2'])
    expect(count).toBe(1)
  })

  it('returns 0 when all artists are already queued', async () => {
    const db = makeSequentialMockDb([{ data: [{ artist_id: 'artist-1' }] }])
    const count = await enqueueArtistSyncJobs(db, ['artist-1'])
    expect(count).toBe(0)
  })

  it('returns 0 for an empty artist list', async () => {
    const db = makeSequentialMockDb([])
    const count = await enqueueArtistSyncJobs(db, [])
    expect(count).toBe(0)
  })
})

describe('cancelSyncJob', () => {
  it('cancels pending jobs immediately', async () => {
    const db = makeSequentialMockDb([
      { data: { id: 'job-1', status: 'pending', cancel_requested_at: null } },
      { data: { id: 'job-1' } }, // update … select maybeSingle
    ])
    await expect(cancelSyncJob(db, 'job-1')).resolves.toBe('cancelled')
  })

  it('requests cancel for running jobs', async () => {
    const db = makeSequentialMockDb([
      { data: { id: 'job-1', status: 'running', cancel_requested_at: null } },
      { data: { id: 'job-1', status: 'running', cancel_requested_at: null } }, // re-read
      { data: { id: 'job-1' } }, // cancel_requested update
    ])
    await expect(cancelSyncJob(db, 'job-1')).resolves.toBe('cancel_requested')
  })

  it('noops for done jobs', async () => {
    const db = makeSequentialMockDb([
      { data: { id: 'job-1', status: 'done', cancel_requested_at: null } },
    ])
    await expect(cancelSyncJob(db, 'job-1')).resolves.toBe('noop')
  })

  it('falls through to cancel_requested when pending claim races', async () => {
    const db = makeSequentialMockDb([
      { data: { id: 'job-1', status: 'pending', cancel_requested_at: null } },
      { data: null }, // pending update lost race
      { data: { id: 'job-1', status: 'running', cancel_requested_at: null } }, // re-read
      { data: { id: 'job-1' } }, // cancel_requested update
    ])
    await expect(cancelSyncJob(db, 'job-1')).resolves.toBe('cancel_requested')
  })
})

describe('markSyncJobDone', () => {
  it('marks cancelled when cancel was requested while running', async () => {
    const db = makeSequentialMockDb([
      { data: { status: 'running', cancel_requested_at: '2026-07-29T12:00:00.000Z' } },
      { data: null }, // markSyncJobCancelled update
    ])
    await markSyncJobDone(db, 'job-1')
    expect(db.from).toHaveBeenCalledWith('sync_queue')
    // First call is cancel check; second is cancelled finalisation — never "done"
    expect(db.from).toHaveBeenCalledTimes(2)
  })
})

describe('listSyncJobs', () => {
  it('lists jobs and attaches artist names from a separate lookup', async () => {
    const queueRow = {
      id: 'job-1',
      artist_id: 'artist-1',
      job_type: 'spotify',
      status: 'pending',
      scheduled_at: '2026-07-29T00:00:00.000Z',
      started_at: null,
      finished_at: null,
      locked_until: null,
      cancel_requested_at: null,
      cancelled_at: null,
      error_message: null,
      attempt_count: 0,
      created_at: '2026-07-29T00:00:00.000Z',
    }
    const db = makeSequentialMockDb([
      { data: [queueRow] },
      { data: [{ id: 'artist-1', name: 'Nightfall' }] },
    ])

    const jobs = await listSyncJobs(db, { status: 'pending', limit: 10 })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.id).toBe('job-1')
    expect(jobs[0]?.artistName).toBe('Nightfall')
    expect(jobs[0]?.status).toBe('pending')
    expect(db.from).toHaveBeenNthCalledWith(1, 'sync_queue')
    expect(db.from).toHaveBeenNthCalledWith(2, 'artists')
  })

  it('returns jobs without names when no artist_ids are present', async () => {
    const queueRow = {
      id: 'job-odesli',
      artist_id: null,
      job_type: 'odesli',
      status: 'running',
      scheduled_at: '2026-07-29T00:00:00.000Z',
      started_at: '2026-07-29T00:01:00.000Z',
      finished_at: null,
      locked_until: null,
      cancel_requested_at: null,
      cancelled_at: null,
      error_message: null,
      attempt_count: 1,
      created_at: '2026-07-29T00:00:00.000Z',
    }
    const db = makeSequentialMockDb([{ data: [queueRow] }])

    const jobs = await listSyncJobs(db, { status: ['pending', 'running'] })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.artistName).toBeNull()
    expect(db.from).toHaveBeenCalledTimes(1)
  })
})

describe('retrySyncJob', () => {
  it('re-queues failed jobs', async () => {
    const db = makeSequentialMockDb([
      { data: { id: 'job-1', status: 'failed' } },
      { data: null },
    ])
    await expect(retrySyncJob(db, 'job-1')).resolves.toBe(true)
  })

  it('returns false for pending jobs', async () => {
    const db = makeSequentialMockDb([{ data: { id: 'job-1', status: 'pending' } }])
    await expect(retrySyncJob(db, 'job-1')).resolves.toBe(false)
  })
})

describe('markSyncJobDone', () => {
  it('clears locked_until on completion', async () => {
    const db = makeSequentialMockDb([{ data: null }])
    await expect(markSyncJobDone(db, 'job-1')).resolves.toBeUndefined()
    expect(db.from).toHaveBeenCalledWith('sync_queue')
  })
})

describe('markSyncJobFailed', () => {
  it('re-queues with backoff when attempts remain', async () => {
    const db = makeSequentialMockDb([{ data: null }])
    await markSyncJobFailed(db, 'job-1', 'timeout', 1)
    expect(db.from).toHaveBeenCalledWith('sync_queue')
  })

  it('marks permanently failed when max attempts reached', async () => {
    const db = makeSequentialMockDb([{ data: null }])
    await markSyncJobFailed(db, 'job-1', 'fatal', MAX_ATTEMPTS)
    expect(db.from).toHaveBeenCalledWith('sync_queue')
  })

  it('re-queues rate-limited jobs without exhausting max attempts', async () => {
    const db = makeSequentialMockDb([{ data: null }])
    await markSyncJobFailed(db, 'job-1', '429', MAX_ATTEMPTS, { rateLimited: true })
    expect(db.from).toHaveBeenCalledWith('sync_queue')
  })
})

describe('getSyncQueueStats', () => {
  it('aggregates per-status counts via head queries', async () => {
    // First call: recoverStuckSyncJobs (update…select). Then 4 status counts.
    let callIndex = 0
    const counts = [3, 1, 10, 2]
    const gteCalls: string[] = []
    const db = {
      from: vi.fn().mockImplementation(() => {
        // recoverStuckSyncJobs
        if (callIndex === 0) {
          callIndex++
          const recoverResult = { data: [], error: null }
          const recoverPromise = Promise.resolve(recoverResult)
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            then: recoverPromise.then.bind(recoverPromise),
            catch: recoverPromise.catch.bind(recoverPromise),
            finally: recoverPromise.finally.bind(recoverPromise),
          }
        }

        const count = counts[callIndex - 1] ?? 0
        callIndex++
        const countResult = { count, error: null }
        const countPromise = Promise.resolve(countResult)
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn((field: string) => {
            gteCalls.push(field)
            return {
              then: countPromise.then.bind(countPromise),
              catch: countPromise.catch.bind(countPromise),
              finally: countPromise.finally.bind(countPromise),
            }
          }),
          then: countPromise.then.bind(countPromise),
          catch: countPromise.catch.bind(countPromise),
          finally: countPromise.finally.bind(countPromise),
        }
      }),
    } as unknown as DbClient

    const stats = await getSyncQueueStats(db)
    expect(stats).toEqual({ pending: 3, running: 1, done: 10, failed: 2 })
    expect(db.from).toHaveBeenCalledTimes(5)
    expect(gteCalls).toEqual(['created_at', 'created_at'])
  })
})