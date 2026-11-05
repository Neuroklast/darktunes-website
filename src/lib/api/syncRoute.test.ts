import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

let waitUntilPromise: Promise<unknown> | null = null

const recordCronTick = vi.fn(async () => {})
const getSyncCredentials = vi.fn(async () => ({}))
const acquireSyncWorkerLease = vi.fn(async () => true)
const releaseSyncWorkerLease = vi.fn(async () => {})
const renewSyncWorkerLease = vi.fn(async () => true)
const startSyncRun = vi.fn(async () => 'run-1')
const finishSyncRun = vi.fn(async () => {})
const claimSyncJobs = vi.fn(async () => [] as Array<Record<string, unknown>>)
const newWorkerLeaseToken = vi.fn(() => 'token-1')
const markSyncJobFailed = vi.fn(async () => {})
const markSyncJobDone = vi.fn(async () => {})
const isSyncJobCancelRequested = vi.fn(async () => false)

vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromise = p
  },
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    CRON_SECRET: 'test-cron-secret',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    CLOUDFLARE_R2_ACCOUNT_ID: 'acct',
    CLOUDFLARE_R2_ACCESS_KEY_ID: 'key',
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret',
    CLOUDFLARE_R2_BUCKET_NAME: 'bucket',
    CLOUDFLARE_R2_PUBLIC_URL: 'https://cdn.example.com',
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/r2Utils', () => ({
  createSyncUploadFn: vi.fn(() => vi.fn()),
}))

vi.mock('@/lib/secrets/getExternalCredentials', () => ({
  getSyncCredentials,
}))

vi.mock('@/lib/sync/syncAll', () => ({
  syncSingleArtist: vi.fn(async () => {
    throw new Error('api down')
  }),
}))

vi.mock('@/lib/sync/queueExecutor', () => ({
  canClaimAnotherJob: () => true,
  EXECUTOR_INTER_JOB_DELAY_MS: 0,
  sleepMs: vi.fn(async () => {}),
}))

vi.mock('@/lib/sync/revalidatePublicContent', () => ({
  revalidatePublicContent: vi.fn(() => {}),
  RELEASE_SYNC_TAGS: ['releases', 'artists'],
}))

vi.mock('@/lib/api/syncQueue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/syncQueue')>()
  return {
    ...actual,
    recordCronTick,
    acquireSyncWorkerLease,
    releaseSyncWorkerLease,
    renewSyncWorkerLease,
    startSyncRun,
    finishSyncRun,
    claimSyncJobs,
    newWorkerLeaseToken,
    markSyncJobFailed,
    markSyncJobDone,
    isSyncJobCancelRequested,
  }
})

async function loadSyncRoute() {
  vi.resetModules()
  return import('../../../app/api/sync/route')
}

function cronRequest() {
  return new NextRequest('https://darktunes.com/api/sync', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-cron-secret' },
  })
}

beforeEach(() => {
  waitUntilPromise = null
  vi.clearAllMocks()
  acquireSyncWorkerLease.mockResolvedValue(true)
  claimSyncJobs.mockResolvedValue([])
  startSyncRun.mockResolvedValue('run-1')
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('POST /api/sync', () => {
  it('accepts a cron kick, records a worker tick and opens a run', async () => {
    const { POST } = await loadSyncRoute()
    const res = await POST(cronRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ accepted: true, alreadyRunning: false })
    expect(recordCronTick).toHaveBeenCalledWith(expect.anything(), 'worker', 'ok')
    expect(startSyncRun).toHaveBeenCalledWith(expect.anything(), 'cron')

    await waitUntilPromise
    expect(finishSyncRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ status: 'ok', claimed: 0, completed: 0, failed: 0 }),
    )
    expect(releaseSyncWorkerLease).toHaveBeenCalledWith(expect.anything(), 'token-1')
    expect(getSyncCredentials).not.toHaveBeenCalled()
  })

  it('returns alreadyRunning without opening a run when the lease is held', async () => {
    acquireSyncWorkerLease.mockResolvedValue(false)
    const { POST } = await loadSyncRoute()
    const res = await POST(cronRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ accepted: true, alreadyRunning: true, processed: 0 })
    expect(recordCronTick).toHaveBeenCalledWith(expect.anything(), 'worker', 'already_running')
    expect(startSyncRun).not.toHaveBeenCalled()
    expect(getSyncCredentials).not.toHaveBeenCalled()
  })

  it('marks the run partial when a claimed job fails', async () => {
    claimSyncJobs.mockResolvedValueOnce([
      {
        id: 'job-1',
        artistId: 'artist-1',
        artistName: null,
        jobType: 'full',
        status: 'running',
        scheduledAt: '2026-07-29T00:00:00.000Z',
        startedAt: '2026-07-29T00:01:00.000Z',
        finishedAt: null,
        lockedUntil: null,
        cancelRequestedAt: null,
        cancelledAt: null,
        errorMessage: null,
        attemptCount: 0,
        createdAt: '2026-07-29T00:00:00.000Z',
      },
    ])

    const { POST } = await loadSyncRoute()
    await POST(cronRequest())
    await waitUntilPromise

    expect(markSyncJobFailed).toHaveBeenCalled()
    expect(getSyncCredentials).toHaveBeenCalledTimes(1)
    expect(finishSyncRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ status: 'partial', claimed: 1, completed: 0, failed: 1 }),
    )
    expect(recordCronTick).toHaveBeenCalledWith(expect.anything(), 'worker', 'partial', undefined)
  })


  it('fetches credentials only once across multiple claimed jobs', async () => {
    const job = {
      id: 'job-1',
      artistId: 'artist-1',
      artistName: null,
      jobType: 'full',
      status: 'running',
      scheduledAt: '2026-07-29T00:00:00.000Z',
      startedAt: '2026-07-29T00:01:00.000Z',
      finishedAt: null,
      lockedUntil: null,
      cancelRequestedAt: null,
      cancelledAt: null,
      errorMessage: null,
      attemptCount: 0,
      createdAt: '2026-07-29T00:00:00.000Z',
    }
    claimSyncJobs.mockResolvedValueOnce([job]).mockResolvedValueOnce([{ ...job, id: 'job-2' }])

    const { POST } = await loadSyncRoute()
    await POST(cronRequest())
    await waitUntilPromise

    expect(getSyncCredentials).toHaveBeenCalledTimes(1)
    expect(finishSyncRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ claimed: 2, failed: 2 }),
    )
  })

  it('completes retired legacy jobs without loading credentials', async () => {
    claimSyncJobs.mockResolvedValueOnce([{
      id: 'legacy-job',
      jobType: 'odesli',
      artistId: null,
      cancelRequestedAt: null,
      attemptCount: 0,
    }])

    const { POST } = await loadSyncRoute()
    await POST(cronRequest())
    await waitUntilPromise

    expect(markSyncJobDone).toHaveBeenCalledWith(expect.anything(), 'legacy-job')
    expect(getSyncCredentials).not.toHaveBeenCalled()
    expect(finishSyncRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-1',
      expect.objectContaining({ claimed: 1, completed: 1, failed: 0 }),
    )
  })

  it('rejects an unauthenticated request', async () => {
    const { POST } = await loadSyncRoute()
    const res = await POST(new NextRequest('https://darktunes.com/api/sync', { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(acquireSyncWorkerLease).not.toHaveBeenCalled()
  })
})
