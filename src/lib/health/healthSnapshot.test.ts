import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildHealthSnapshot } from './healthSnapshot'
import { invalidateCredentialCache } from '@/lib/secrets/getExternalCredentials'
import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const NOW_MS = new Date('2026-06-23T12:00:00.000Z').getTime()

const RECENT_ITUNES_LOG = {
  api_source: 'itunes',
  created_at: '2026-06-23T11:00:00.000Z',
  status: 'success',
  rate_limited: false,
  errors: [],
  duration_ms: 900,
  releases_synced: 2,
  metadata: {},
}

const OLDER_SPOTIFY_LOG = {
  api_source: 'spotify',
  created_at: '2026-06-20T11:00:00.000Z',
  status: 'success',
  rate_limited: false,
  errors: [],
  duration_ms: 1200,
  releases_synced: 4,
  metadata: { artists_processed: 1 },
}

function makeThenableBuilder(data: unknown, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return builder
}

/** Chain that filters sync_logs by api_source when `.eq('api_source', …)` is used. */
function makeSyncLogsBuilder(allLogs: (typeof RECENT_ITUNES_LOG)[]) {
  let sourceFilter: string | null = null
  let gteFilter: string | null = null

  const resolve = () => {
    let rows = allLogs
    if (sourceFilter) {
      rows = rows.filter((r) => r.api_source === sourceFilter)
    }
    if (gteFilter) {
      rows = rows.filter((r) => r.created_at >= gteFilter!)
    }
    return { data: rows, error: null }
  }

  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, value: string) => {
      if (col === 'api_source') sourceFilter = value
      return builder
    }),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    gte: vi.fn((col: string, value: string) => {
      if (col === 'created_at') gteFilter = value
      return builder
    }),
    maybeSingle: vi.fn(async () => {
      const { data, error } = resolve()
      return { data: data[0] ?? null, error }
    }),
  }
  const p = Promise.resolve().then(resolve)
  builder.then = p.then.bind(p)
  builder.catch = p.catch.bind(p)
  builder.finally = p.finally.bind(p)
  return builder
}

function createMockDb(
  logs: (typeof RECENT_ITUNES_LOG)[] = [RECENT_ITUNES_LOG, OLDER_SPOTIFY_LOG],
): SupabaseClient<Database> {
  return {
    from: vi.fn((table: string) => {
      if (table === 'site_settings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'sync_logs') {
        return makeSyncLogsBuilder(logs)
      }
      if (table === 'api_credentials') {
        return makeThenableBuilder([])
      }
      if (table === 'sync_queue') {
        return {
          select: vi.fn((fields: string) =>
            makeThenableBuilder(
              fields === 'id' ? [] : [{ status: 'done' }, { status: 'pending' }],
            ),
          ),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
        }
      }
      if (table === 'artists') {
        const countResult = { count: 0, error: null }
        const countPromise = Promise.resolve(countResult)
        return {
          select: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          then: countPromise.then.bind(countPromise),
          catch: countPromise.catch.bind(countPromise),
          finally: countPromise.finally.bind(countPromise),
        }
      }
      return makeThenableBuilder(null)
    }),
  } as unknown as SupabaseClient<Database>
}

describe('buildHealthSnapshot', () => {
  beforeEach(() => {
    invalidateCredentialCache()
    vi.stubEnv('API_CREDENTIALS_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
  })

  it('returns unavailable APIs when db is null', async () => {
    const snapshot = await buildHealthSnapshot({ db: null, nowMs: NOW_MS })
    expect(snapshot.database.status).toBe('offline')
    expect(snapshot.apis.itunes.operationalState).toBe('unavailable')
    expect(snapshot.healthScore).toBe(0)
    expect(snapshot.alerts.length).toBeGreaterThan(0)
  })

  it('builds full snapshot when db is online', async () => {
    const snapshot = await buildHealthSnapshot({
      db: createMockDb(),
      knownApis: { itunes: true, odesli: true },
      nowMs: NOW_MS,
    })

    expect(snapshot.database.status).toBe('online')
    expect(snapshot.apis.itunes.operationalState).toBe('operational')
    expect(snapshot.apis.itunes.stats24h.total).toBe(1)
    expect(snapshot.apis.itunes.stats24h.successRate).toBe(100)
    expect(snapshot.healthScore).toBeGreaterThan(0)
    expect(snapshot.kpis.configuredApis).toBe(2)
    expect(snapshot.syncQueue).not.toBeNull()
    expect(snapshot.cronHealth).not.toBeNull()
    expect(snapshot.checkedAt).toBeTruthy()
  })

  it('queries sync_logs for liveness, per-api latest, and 24h stats', async () => {
    const db = createMockDb()
    await buildHealthSnapshot({
      db,
      knownApis: { itunes: true, odesli: true },
      nowMs: NOW_MS,
    })

    const fromCalls = (db.from as ReturnType<typeof vi.fn>).mock.calls
    const syncLogsCall = fromCalls.filter(([t]) => t === 'sync_logs')
    // ping + latest itunes + latest odesli + 24h stats (≥4)
    expect(syncLogsCall.length).toBeGreaterThanOrEqual(4)
  })

  it('surfaces older API last-runs even when a recent chatty source exists', async () => {
    const snapshot = await buildHealthSnapshot({
      db: createMockDb([RECENT_ITUNES_LOG, OLDER_SPOTIFY_LOG]),
      knownApis: { itunes: true, spotify: true, odesli: true },
      nowMs: NOW_MS,
    })

    expect(snapshot.apis.itunes.lastSyncAt).toBe(RECENT_ITUNES_LOG.created_at)
    // Older than 36h STALE_SYNC_MS → stale, not "Awaiting first sync" / Never
    expect(snapshot.apis.spotify.lastSyncAt).toBe(OLDER_SPOTIFY_LOG.created_at)
    expect(snapshot.apis.spotify.operationalState).toBe('stale')
    expect(snapshot.apis.spotify.statusLabel).not.toMatch(/awaiting first/i)
  })

  it('stays healthy when no third-party API keys are configured', async () => {
    const snapshot = await buildHealthSnapshot({
      db: createMockDb(),
      knownApis: {
        itunes: true,
        spotify: false,
        discogs: false,
        songkick: false,
        bandsintown: false,
        odesli: true,
        lastfm: false,
        soundcharts: false,
        apify: false,
        youtube: false,
      },
      nowMs: NOW_MS,
    })

    expect(snapshot.database.status).toBe('online')
    expect(snapshot.status).not.toBe('unhealthy')
    expect(snapshot.apis.spotify.operationalState).toBe('unconfigured')
    expect(snapshot.kpis.configuredApis).toBe(2)
  })
})