import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'


const authenticatePartnerApiKeyMock = vi.fn()
const createServiceRoleSupabaseClientMock = vi.fn()
const listPartnerArtistsMock = vi.fn()
const organizationHasFeatureMock = vi.fn()

vi.mock('@/lib/organizations/features', () => ({
  organizationHasFeature: (...args: unknown[]) => organizationHasFeatureMock(...args),
}))

vi.mock('@/lib/partner-api/auth', () => ({
  authenticatePartnerApiKey: (...args: unknown[]) => authenticatePartnerApiKeyMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: () => createServiceRoleSupabaseClientMock(),
}))

vi.mock('@/lib/partner-api/queries', () => ({
  listPartnerArtists: (...args: unknown[]) => listPartnerArtistsMock(...args),
}))

let GET: (req: NextRequest) => Promise<Response>

describe('GET /api/v1/artists', () => {
  beforeAll(async () => {
    vi.resetModules()
    ;({ GET } = await import('../../../app/api/v1/artists/route'))
  })

  beforeEach(() => {
    authenticatePartnerApiKeyMock.mockResolvedValue({
      organizationId: 'org-1',
      apiKeyId: 'key-1',
      scopes: ['read'],
    })
    createServiceRoleSupabaseClientMock.mockResolvedValue({})
    organizationHasFeatureMock.mockResolvedValue(true)
    listPartnerArtistsMock.mockResolvedValue({ data: [{ id: 'artist-1' }], nextCursor: null })
  })

  it('returns paginated artists for a valid API key', async () => {
    const req = new NextRequest('http://localhost/api/v1/artists?limit=10', {
      headers: { Authorization: 'Bearer dt_live_testkey123456' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: Array<{ id: string }> }
    expect(json.data[0].id).toBe('artist-1')
    expect(listPartnerArtistsMock).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      expect.objectContaining({ limit: 10 }),
    )
  })

})