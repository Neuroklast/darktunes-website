import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

function mockSupabaseClient(opts: { role: 'admin' | 'editor' | 'user'; authError?: boolean }) {
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => {
      // verifyPermission makes two sequential from() calls:
      //   1st: from('profiles').select('role').eq(...).maybeSingle()
      //   2nd (non-admin only): from('role_permissions').select(perm).eq(...).maybeSingle()
      const makeChain = (data: Record<string, unknown>) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data, error: null })),
      })
      const fromMock = vi.fn()
        .mockReturnValueOnce(makeChain({ role: opts.role }))
        .mockReturnValue(makeChain({ can_manage_artists: opts.role === 'editor' }))
      return {
        auth: {
          getUser: vi.fn(async () =>
            opts.authError
              ? { data: { user: null }, error: new Error('Unauthorized') }
              : { data: { user: { id: 'user-1' } }, error: null },
          ),
        },
        from: fromMock,
      }
    }),
  }))
}

async function loadRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/prefill-artist-itunes/route')
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('POST /api/admin/prefill-artist-itunes', () => {
  it('returns prefill payload for an admin token', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mockSupabaseClient({ role: 'admin' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              wrapperType: 'artist',
              artistName: 'Dark Artist',
              artistId: 123456789,
              primaryGenreName: 'Industrial',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/100x100bb.jpg',
              artistLinkUrl: 'https://music.apple.com/us/artist/dark-artist/123456789',
            },
          ],
        }),
      })) as unknown as typeof fetch,
    )

    const { POST } = await loadRoute()
    const response = await POST(
      new Request('http://localhost/api/admin/prefill-artist-itunes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appleMusicUrl: 'https://music.apple.com/us/artist/dark-artist/123456789' }),
      }) as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      name: 'Dark Artist',
      genres: ['Industrial'],
      imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/600x600bb.jpg',
      appleMusicUrl: 'https://music.apple.com/us/artist/dark-artist/123456789',
      itunesArtistId: '123456789',
    })
  })

  it('returns 400 when appleMusicUrl is invalid', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mockSupabaseClient({ role: 'editor' })
    const { POST } = await loadRoute()
    const response = await POST(
      new Request('http://localhost/api/admin/prefill-artist-itunes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appleMusicUrl: 'not-a-valid-link' }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid Apple Music artist URL or ID' })
  })

  it('returns 403 when user is not admin or editor', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mockSupabaseClient({ role: 'user' })
    const { POST } = await loadRoute()
    const response = await POST(
      new Request('http://localhost/api/admin/prefill-artist-itunes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appleMusicUrl: 'https://music.apple.com/us/artist/dark-artist/123456789' }),
      }) as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('Forbidden') })
  })

  it('returns 401 when token is invalid', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mockSupabaseClient({ role: 'admin', authError: true })
    const { POST } = await loadRoute()
    const response = await POST(
      new Request('http://localhost/api/admin/prefill-artist-itunes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appleMusicUrl: '123456789' }),
      }) as never,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  it('returns 400 when iTunes lookup has no artist result', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mockSupabaseClient({ role: 'admin' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          resultCount: 0,
          results: [],
        }),
      })) as unknown as typeof fetch,
    )

    const { POST } = await loadRoute()
    const response = await POST(
      new Request('http://localhost/api/admin/prefill-artist-itunes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appleMusicUrl: '123456789' }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'Artist not found on Apple Music' })
  })

  it('returns 502 when iTunes lookup API fails', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mockSupabaseClient({ role: 'admin' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
      })) as unknown as typeof fetch,
    )

    const { POST } = await loadRoute()
    const response = await POST(
      new Request('http://localhost/api/admin/prefill-artist-itunes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appleMusicUrl: '123456789' }),
      }) as never,
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/^iTunes API error: 503 \(Error ID: ERR-[0-9A-F]{8}\)$/),
      error_id: expect.stringMatching(/^ERR-[0-9A-F]{8}$/),
    })
  })
})
