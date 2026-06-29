import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const authenticatePartnerApiKeyMock = vi.fn()
const createServiceRoleSupabaseClientMock = vi.fn()
const organizationHasFeatureMock = vi.fn()

vi.mock('@/lib/partner-api/auth', () => ({
  authenticatePartnerApiKey: (...args: unknown[]) => authenticatePartnerApiKeyMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: () => createServiceRoleSupabaseClientMock(),
}))

vi.mock('@/lib/organizations/features', () => ({
  organizationHasFeature: (...args: unknown[]) => organizationHasFeatureMock(...args),
}))

vi.mock('@/lib/api/streamingStats', () => ({
  getStreamingStatsByArtistId: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/api/artistTerritoryMetrics', () => ({
  getTerritoryMetricsByArtistId: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/api/artistListenerMetrics', () => ({
  getListenerMetricsByArtistId: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/api/salesStatements', () => ({
  getSalesStatementsByArtistId: vi.fn().mockResolvedValue([]),
}))

let GET: (req: NextRequest) => Promise<Response>

describe('GET /api/v1/analytics/export', () => {
  beforeAll(async () => {
    vi.resetModules()
    ;({ GET } = await import('../../../app/api/v1/analytics/export/route'))
  })

  beforeEach(() => {
    authenticatePartnerApiKeyMock.mockResolvedValue({
      organizationId: 'org-1',
      apiKeyId: 'key-1',
      scopes: ['read'],
    })
    organizationHasFeatureMock.mockResolvedValue(true)
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'artist-1' }, error: null })
    createServiceRoleSupabaseClientMock.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    })
  })

  it('returns 400 when artistId is missing', async () => {
    const req = new NextRequest('http://localhost/api/v1/analytics/export', {
      headers: { Authorization: 'Bearer dt_live_test' },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns CSV for valid request', async () => {
    const req = new NextRequest(
      'http://localhost/api/v1/analytics/export?artistId=artist-1&format=csv',
      { headers: { Authorization: 'Bearer dt_live_test' } },
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
  })
})