import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest, readJson } from '../../helpers/api/routeTestkit'

const requireAdminFromRequestMock = vi.fn()
const createServiceRoleSupabaseClientMock = vi.fn()
const purgeSosDataMock = vi.fn()
const assertSosPurgeAllowedMock = vi.fn()
const logAdminActionMock = vi.fn()
const logAdminActionForRequestMock = vi.fn()
const logFinancialEventMock = vi.fn()
const deleteObjectFromR2Mock = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminFromRequest: (...args: unknown[]) => requireAdminFromRequestMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: (...args: unknown[]) =>
    createServiceRoleSupabaseClientMock(...args),
}))

vi.mock('@/lib/sos/purgeSosData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sos/purgeSosData')>()
  return {
    ...actual,
    purgeSosData: (...args: unknown[]) => purgeSosDataMock(...args),
  }
})

vi.mock('@/lib/sos/purgePeriodLock', () => ({
  assertSosPurgeAllowed: (...args: unknown[]) => assertSosPurgeAllowedMock(...args),
}))

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminAction: (...args: unknown[]) => logAdminActionMock(...args),
  logAdminActionForRequest: (...args: unknown[]) => logAdminActionForRequestMock(...args),
  auditAdminMutation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/api/financialAudit', () => ({
  logFinancialEvent: (...args: unknown[]) => logFinancialEventMock(...args),
}))

vi.mock('@/lib/r2Utils', () => ({
  createR2Client: vi.fn(() => ({})),
  deleteObjectFromR2: (...args: unknown[]) => deleteObjectFromR2Mock(...args),
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    CLOUDFLARE_R2_ACCOUNT_ID: 'acc',
    CLOUDFLARE_R2_ACCESS_KEY_ID: 'key',
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret',
    CLOUDFLARE_R2_BUCKET_NAME: 'bucket',
  },
}))

async function loadRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/maintenance/purge-sos-data/route')
}

describe('POST /api/admin/maintenance/purge-sos-data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminFromRequestMock.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
    createServiceRoleSupabaseClientMock.mockResolvedValue({ kind: 'service' })
    purgeSosDataMock.mockResolvedValue({
      bronze_deleted: 2,
      r2_deleted: 2,
      r2_failed: 0,
      gold: {
        artist_territory_metrics: 0,
        merch_orders: 0,
        sos_period_summaries: 0,
        event_impact: 0,
      },
    })
    logAdminActionMock.mockResolvedValue(undefined)
    logAdminActionForRequestMock.mockResolvedValue(undefined)
    logFinancialEventMock.mockResolvedValue(undefined)
    assertSosPurgeAllowedMock.mockResolvedValue(undefined)
  })

  it('rejects the wrong confirmation phrase', async () => {
    const { POST } = await loadRoute()
    const res = await POST(
      jsonRequest('/api/admin/maintenance/purge-sos-data', {
        method: 'POST',
        bearer: 'tok',
        body: { scope: 'failed_bronze', confirmation: 'yes' },
      }),
    )
    expect(res.status).toBe(400)
    expect(purgeSosDataMock).not.toHaveBeenCalled()
  })

  it('returns 409 problem+json and purges nothing when a locked period owns the data', async () => {
    const { POST } = await loadRoute()
    const { BusinessRuleError } = await import('@/lib/errors')
    assertSosPurgeAllowedMock.mockRejectedValue(
      new BusinessRuleError('Purge blocked: locked period 2025-10-01 – 2026-03-31', 409, 'SETTLEMENT_PERIOD_LOCKED'),
    )

    const res = await POST(
      jsonRequest('/api/admin/maintenance/purge-sos-data', {
        method: 'POST',
        bearer: 'tok',
        body: { scope: 'gold', confirmation: 'DELETE GOLD' },
      }),
    )

    expect(res.headers.get('content-type')).toContain('application/problem+json')
    const { status, body } = await readJson<{ status?: number; code?: string }>(res)
    expect(status).toBe(409)
    expect(body.status).toBe(409)
    expect(body.code).toBe('SETTLEMENT_PERIOD_LOCKED')
    expect(purgeSosDataMock).not.toHaveBeenCalled()
  })

  it('purges and writes admin + financial audit rows', async () => {
    const { POST } = await loadRoute()
    const { status, body } = await readJson<{ ok?: boolean; bronze_deleted?: number }>(
      await POST(
        jsonRequest('/api/admin/maintenance/purge-sos-data', {
          method: 'POST',
          bearer: 'tok',
          body: { scope: 'failed_bronze', confirmation: 'DELETE FAILED' },
        }),
      ),
    )

    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.bronze_deleted).toBe(2)
    expect(logAdminActionForRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'purged',
        resource: 'sos_data',
      }),
    )
    expect(logFinancialEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'sos_data',
        action: 'purged',
        actorId: 'admin-1',
      }),
    )
  })
})
