import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest, readJson } from '../../helpers/api/routeTestkit'

const requireAdminFromRequestMock = vi.fn()
const createServiceRoleSupabaseClientMock = vi.fn()
const purgeSosDataMock = vi.fn()
const logAdminActionMock = vi.fn()
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

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminAction: (...args: unknown[]) => logAdminActionMock(...args),
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
    logFinancialEventMock.mockResolvedValue(undefined)
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
    expect(logAdminActionMock).toHaveBeenCalledWith(
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
