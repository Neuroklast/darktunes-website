import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/health/cachedHealthSnapshot', () => ({
  getCachedHealthSnapshot: vi.fn(async () => {
    const { buildHealthSnapshot } = await import('@/lib/health/healthSnapshot')
    const { createHealthDbClient } = await import('@/lib/health/healthDbClient')
    return buildHealthSnapshot({ db: createHealthDbClient() })
  }),
}))

const ORIGINAL_ENV = { ...process.env }
const MOCK_LITE_REQUEST = new NextRequest('http://localhost/api/health')
const MOCK_FULL_REQUEST = new NextRequest('http://localhost/api/health?mode=full', {
  headers: { Authorization: 'Bearer test-cron-secret' },
})
const MOCK_FULL_UNAUTH_REQUEST = new NextRequest('http://localhost/api/health?mode=full')

const SAMPLE_LOG_ROW = {
  api_source: 'itunes',
  created_at: new Date(Date.now() - 60_000).toISOString(),
  status: 'success',
  rate_limited: false,
  errors: [],
  duration_ms: 900,
  releases_synced: 2,
  metadata: { artists_processed: 1, concerts_synced: 0 },
}

function makeThenableBuilder(data: unknown, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    // Credential lookup chains: .select().eq().eq().maybeSingle()
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function mockSupabaseClientOnline(): void {
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'site_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'sync_logs') {
          return makeThenableBuilder([SAMPLE_LOG_ROW])
        }
        if (table === 'api_credentials') {
          return makeThenableBuilder([])
        }
        if (table === 'sync_queue') {
          const countBuilder = (count: number) => {
            const countResult = { count, error: null }
            const countPromise = Promise.resolve(countResult)
            return {
              eq: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              then: countPromise.then.bind(countPromise),
              catch: countPromise.catch.bind(countPromise),
              finally: countPromise.finally.bind(countPromise),
            }
          }
          return {
            select: vi.fn((fields: string, options?: { count?: string; head?: boolean }) => {
              if (options?.head) {
                return countBuilder(1)
              }
              return makeThenableBuilder(fields === 'id' ? [] : [{ status: 'done' }])
            }),
            // recoverStuckSyncJobs (update → eq → or → select)
            update: vi.fn().mockReturnThis(),
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
    })),
  }))
}

async function loadHealthRoute() {
  vi.resetModules()
  return import('../../../app/api/health/route')
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.restoreAllMocks()
})

describe('app/api/health/route', () => {
  it('HEAD returns the same status code as GET', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const { GET, HEAD } = await loadHealthRoute()
    const getResponse = await GET(MOCK_LITE_REQUEST)
    const headResponse = await HEAD(MOCK_LITE_REQUEST)

    expect(headResponse.status).toBe(getResponse.status)
    expect(await headResponse.text()).toBe('')
  })

  it('GET defaults to lite liveness without full snapshot fields', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mockSupabaseClientOnline()

    const { GET } = await loadHealthRoute()
    const response = await GET(MOCK_LITE_REQUEST)

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      status: string
      database: { status: string }
      checkedAt: string
      healthScore?: number
    }
    expect(body.status).toBe('ok')
    expect(body.database.status).toBe('online')
    expect(body.checkedAt).toBeTruthy()
    expect(body.healthScore).toBeUndefined()
  })

  it('GET mode=full without auth returns 401', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.CRON_SECRET = 'test-cron-secret'

    const { GET } = await loadHealthRoute()
    const response = await GET(MOCK_FULL_UNAUTH_REQUEST)
    expect(response.status).toBe(401)
  })

  it('HEAD returns 200 when GET full snapshot is healthy', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.API_CREDENTIALS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    mockSupabaseClientOnline()

    const { GET, HEAD } = await loadHealthRoute()
    const getResponse = await GET(MOCK_FULL_REQUEST)
    const headResponse = await HEAD(MOCK_LITE_REQUEST)

    expect(getResponse.status).toBe(200)
    expect(headResponse.status).toBe(200)

    const body = (await getResponse.json()) as {
      statusLabel: string
      healthScore: number
      kpis: { configuredApis: number }
      alerts: unknown[]
      apis: Record<string, { statusLabel: string; operationalState: string; stats24h: { total: number } }>
      syncQueue: { statusLabel: string } | null
    }
    expect(body.statusLabel).toBeTruthy()
    expect(body.healthScore).toBeGreaterThan(0)
    expect(body.kpis.configuredApis).toBeGreaterThan(0)
    expect(Array.isArray(body.alerts)).toBe(true)
    expect(body.apis.itunes.operationalState).toBe('operational')
    expect(body.apis.itunes.statusLabel).toBe('Operational')
    expect(body.apis.itunes.stats24h.total).toBe(1)
    expect(body.syncQueue?.statusLabel).toBeTruthy()
  })

  it('returns 200 when database is online but third-party keys are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.API_CREDENTIALS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

    mockSupabaseClientOnline()

    const { GET } = await loadHealthRoute()
    const response = await GET(MOCK_FULL_REQUEST)

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      status: string
      database: { status: string }
      apis: Record<string, { operationalState: string }>
    }
    expect(body.database.status).toBe('online')
    // Overall status may be degraded/unhealthy when third-party keys are missing;
    // the contract here is that the endpoint still returns a snapshot with DB online.
    expect(body.apis.spotify?.operationalState).toBe('unconfigured')
  })

  it('OPTIONS responds with CORS preflight headers', async () => {
    const { OPTIONS } = await loadHealthRoute()
    const response = await OPTIONS()

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
  })
})