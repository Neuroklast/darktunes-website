import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const authenticatePortalBearerMock = vi.fn()
const resolvePortalArtistMock = vi.fn()
const createServiceRoleSupabaseClientMock = vi.fn()
const portalWriteWithCanaryMock = vi.fn()

vi.mock('@/lib/portal/bearerAuth', () => ({
  authenticatePortalBearer: authenticatePortalBearerMock,
}))

vi.mock('@/lib/api/artistProfiles', () => ({
  resolvePortalArtist: resolvePortalArtistMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: createServiceRoleSupabaseClientMock,
}))

vi.mock('@/lib/portal/portalWriteClient', () => ({
  portalWriteWithCanary: portalWriteWithCanaryMock,
}))

vi.mock('@/lib/organizations/requestContext', () => ({
  getRequestOrganizationId: vi.fn().mockResolvedValue('00000000-0000-0000-0000-000000000000'),
}))

async function load() {
  vi.resetModules()
  return import('./withPortalMembership')
}

describe('withPortalMembership', () => {
  const userDb = { kind: 'user' }
  const serviceDb = { kind: 'service' }
  const user = { id: 'user-1' }
  const artist = { id: 'artist-1', slug: 'band' }

  beforeEach(() => {
    vi.clearAllMocks()
    authenticatePortalBearerMock.mockResolvedValue({
      token: 'tok',
      user,
      supabase: userDb,
    })
    resolvePortalArtistMock.mockResolvedValue(artist)
    createServiceRoleSupabaseClientMock.mockResolvedValue(serviceDb)
  })

  it('returns userDb, serviceDb, and resolved artist', async () => {
    const { withPortalMembership } = await load()
    const req = new NextRequest('http://localhost/api/portal/profile', {
      headers: { authorization: 'Bearer tok' },
    })

    const ctx = await withPortalMembership(req, 'artist-1')

    expect(resolvePortalArtistMock).toHaveBeenCalledWith(
      userDb,
      'user-1',
      'artist-1',
      '00000000-0000-0000-0000-000000000000',
    )
    expect(ctx).toMatchObject({
      token: 'tok',
      user,
      artist,
      organizationId: '00000000-0000-0000-0000-000000000000',
      userDb,
      serviceDb,
    })
  })

  it('maps FORBIDDEN membership to ApiError 403', async () => {
    resolvePortalArtistMock.mockRejectedValue(new Error('FORBIDDEN: not a member'))
    const { withPortalMembership } = await load()
    const req = new NextRequest('http://localhost/api/portal/x')

    await expect(withPortalMembership(req, 'artist-1')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('maps missing artist to 403', async () => {
    resolvePortalArtistMock.mockResolvedValue(null)
    const { withPortalMembership } = await load()
    const req = new NextRequest('http://localhost/api/portal/x')

    await expect(withPortalMembership(req)).rejects.toMatchObject({ status: 403 })
  })
})

describe('portalMemberWrite', () => {
  it('delegates to portalWriteWithCanary with membership context', async () => {
    const { portalMemberWrite } = await load()
    const write = vi.fn(async () => 'ok')
    portalWriteWithCanaryMock.mockResolvedValue({ value: 'ok', via: 'service_role', fellBack: false })

    const ctx = {
      token: 't',
      user: { id: 'user-1' },
      artist: { id: 'artist-1' },
      organizationId: '00000000-0000-0000-0000-000000000000',
      userDb: { u: 1 },
      serviceDb: { s: 1 },
    } as unknown as import('./withPortalMembership').PortalMembershipContext

    const result = await portalMemberWrite(
      ctx,
      { route: 'PUT /api/portal/profile', table: 'artists', operation: 'update' },
      write,
    )

    expect(result.value).toBe('ok')
    expect(portalWriteWithCanaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userDb: ctx.userDb,
        serviceDb: ctx.serviceDb,
        context: expect.objectContaining({
          route: 'PUT /api/portal/profile',
          table: 'artists',
          artistId: 'artist-1',
          userId: 'user-1',
        }),
        write,
      }),
    )
  })
})
