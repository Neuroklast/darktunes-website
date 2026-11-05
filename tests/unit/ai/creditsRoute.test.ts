import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectStatus, jsonRequest } from '../../helpers/api/routeTestkit'

const requireAdminWithServiceClient = vi.fn()
const getAiSettings = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminWithServiceClient: (...args: unknown[]) => requireAdminWithServiceClient(...args),
}))
vi.mock('@/lib/api/aiSettings', () => ({
  getAiSettings: (...args: unknown[]) => getAiSettings(...args),
}))

const primaryModel = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'
const fastModel = 'nvidia/nemotron-3.5-lightning-30b-a3b'
const settings = {
  enabled: true,
  buffer_percent: 25,
  artist_monthly: 1000,
  editor_monthly: 2000,
  admin_monthly: 20000,
  model_prices: {
    [primaryModel]: { input_per_million_eur: 0.5, output_per_million_eur: 1.5 },
    [fastModel]: { input_per_million_eur: 0.5, output_per_million_eur: 1.5 },
  },
}

function mockDb() {
  const db = {
    from: vi.fn((table: string) => {
      let columns = '*'
      const query = {
        select: vi.fn((value: string) => { columns = value; return query }),
        eq: vi.fn(() => query),
        single: vi.fn(async () => {
          const row = { id: true, updated_at: '2026-11-05T00:00:00.000Z', ...settings }
          const selected = columns === '*'
            ? row
            : Object.fromEntries(columns.split(',').map(key => key.trim()).map(key => [key, row[key as keyof typeof row]]))
          return { data: selected, error: null }
        }),
        order: vi.fn(() => query),
        limit: vi.fn(async () => ({ data: [], error: null })),
      }
      if (table === 'ai_credit_settings') return query
      return query
    }),
    rpc: vi.fn(async (name: string) => ({
      data: name === 'ai_credit_cost_summary'
        ? { provider_cost_eur: 0, charged_credits: 0, calls: 0, by_model: [] }
        : settings,
      error: null,
    })),
  }
  return db
}

describe('/api/admin/ai/credits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAiSettings.mockResolvedValue({
      modelFast: fastModel,
      modelReasoning: primaryModel,
      fallbackModel: null,
    })
  })

  it('only returns editable fields, not DB metadata rejected by PATCH', async () => {
    const db = mockDb()
    requireAdminWithServiceClient.mockResolvedValue({ serviceClient: db })
    const { GET } = await import('../../../app/api/admin/ai/credits/route')
    const response = await GET(jsonRequest('/api/admin/ai/credits', { bearer: 'admin-token' }))
    const body = await expectStatus<{ settings: typeof settings & { id?: boolean; updated_at?: string } }>(response, 200)

    expect(body.settings).toEqual(settings)
    expect(body.settings).not.toHaveProperty('id')
    expect(body.settings).not.toHaveProperty('updated_at')
    const query = db.from.mock.results.find((_, index) => db.from.mock.calls[index]?.[0] === 'ai_credit_settings')?.value
    expect(query.select).toHaveBeenCalledWith(
      'enabled, buffer_percent, artist_monthly, editor_monthly, admin_monthly, model_prices',
    )
  })

  it('accepts the visible NVIDIA prices and limits', async () => {
    const db = mockDb()
    requireAdminWithServiceClient.mockResolvedValue({ serviceClient: db })
    const { PATCH } = await import('../../../app/api/admin/ai/credits/route')
    const response = await PATCH(jsonRequest('/api/admin/ai/credits', {
      method: 'PATCH',
      bearer: 'admin-token',
      body: settings,
    }))
    await expectStatus(response, 200)
    expect(db.rpc).toHaveBeenCalledWith('update_ai_credit_settings', expect.objectContaining({
      p_enabled: true,
      p_model_prices: settings.model_prices,
      p_artist_monthly: 1000,
    }))
  })

  it('still rejects DB-only fields when directly submitted to PATCH', async () => {
    const db = mockDb()
    requireAdminWithServiceClient.mockResolvedValue({ serviceClient: db })
    const { PATCH } = await import('../../../app/api/admin/ai/credits/route')
    const response = await PATCH(jsonRequest('/api/admin/ai/credits', {
      method: 'PATCH',
      bearer: 'admin-token',
      body: { ...settings, id: true, updated_at: '2026-11-05T00:00:00.000Z' },
    }))
    await expectStatus(response, 400)
    expect(db.rpc).not.toHaveBeenCalled()
  })
})
