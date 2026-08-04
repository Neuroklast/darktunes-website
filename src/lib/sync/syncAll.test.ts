import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { syncAll, syncSingleArtist } from './syncAll'
import type { SyncAllDeps } from './syncAll'

type DbClient = SupabaseClient<Database>
type ArtistRow = Database['public']['Tables']['artists']['Row']
type QueryResult = { data: unknown; error: { message: string } | null }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createThenable(result: QueryResult) {
  const promise = Promise.resolve(result)
  return {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
}

function makeBuilder(result: QueryResult) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => createThenable(result)),
    maybeSingle: vi.fn().mockImplementation(() => createThenable(result)),
    ...createThenable(result),
  }
}

function makeMockDb(factory: (table: string) => QueryResult): DbClient {
  return {
    from: vi.fn().mockImplementation((table: string) => makeBuilder(factory(table))),
  } as unknown as DbClient
}

const mockArtist: ArtistRow = {
  id: 'artist-1',
  name: 'Test Artist',
  slug: 'test-artist',
  bio: null,
  genres: [],
  image_url: null,
  spotify_url: null,
  apple_music_url: null,
  instagram_url: null,
  youtube_url: null,
  website_url: null,
  featured: false,
  country: null,
  email: null,
  vat_number: null,
  is_eu_non_german: false,
  notes: null,
  spotify_id: null,
  discogs_id: null,
  songkick_id: null,
  bandsintown_id: null,
  bandsintown_api_key: null,  lastfm_name: null, soundcharts_id: null, last_synced_at: null,
  user_id: null,
  facebook_url: null,
  twitter_url: null,
  tiktok_url: null,
  bandcamp_url: null,
  shop_url: null,
  founding_year: null,
  hometown: null,
  soundcloud_url: null,
  is_visible: true,
  logo_url: null,
  platform_links: null,
  storage_quota_bytes: null,
  smart_links: null,
  image_position_x: null,
  image_position_y: null,
  image_scale: null,
  landing_publish_trusted: false,
  portal_terms_version: null,
  portal_terms_accepted_at: null,
  portal_terms_accepted_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncAll', () => {
  it('returns error result when artists fetch fails', async () => {
    const db = makeMockDb(() => ({ data: null, error: { message: 'DB down' } }))
    const deps: SyncAllDeps = {
      db,
      fetch: vi.fn() as typeof fetch,
      uploadToR2: vi.fn().mockResolvedValue('https://cdn.example.com/image.jpg'),
    }
    const result = await syncAll(deps)
    expect(result.totalErrors).toBe(1)
    expect(result.results[0].errors[0]).toContain('DB down')
  })

  it('runs iTunes sync for artists with no external IDs', async () => {
    // DB returns one artist for 'artists', empty arrays for everything else
    const db = makeMockDb((table) => {
      if (table === 'artists') return { data: [mockArtist], error: null }
      return { data: [], error: null }
    })

    // Mock fetch to avoid real HTTP: iTunes search returns empty results
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    })

    const deps: SyncAllDeps = {
      db,
      fetch: fetchFn as typeof fetch,
      uploadToR2: vi.fn().mockResolvedValue('https://cdn.example.com/image.jpg'),
    }

    const result = await syncAll(deps)
    // iTunes result should be present
    const itunesResult = result.results.find((r) => r.api === 'itunes')
    expect(itunesResult).toBeDefined()
    expect(itunesResult?.artistsProcessed).toBe(1)
    // No hard errors for an artist without itunes_id
    expect(itunesResult?.errors).toHaveLength(0)
  })

  it('skips Spotify sync when no credentials provided', async () => {
    const db = makeMockDb((table) => {
      if (table === 'artists') return { data: [{ ...mockArtist, spotify_id: 'spot-1' }], error: null }
      return { data: [], error: null }
    })
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    })

    const deps: SyncAllDeps = {
      db,
      fetch: fetchFn as typeof fetch,
      uploadToR2: vi.fn(),
      // no spotify credentials → Spotify sync skipped
    }

    const result = await syncAll(deps)
    const spotifyResult = result.results.find((r) => r.api === 'spotify')
    expect(spotifyResult).toBeUndefined()
  })

  it('respects onlyApi filter', async () => {
    const db = makeMockDb((table) => {
      if (table === 'artists') return { data: [mockArtist], error: null }
      return { data: [], error: null }
    })
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    })

    const deps: SyncAllDeps = {
      db,
      fetch: fetchFn as typeof fetch,
      uploadToR2: vi.fn(),
      onlyApi: 'itunes',
    }

    const result = await syncAll(deps)
    expect(result.results.every((r) => r.api === 'itunes')).toBe(true)
  })

  it('filters artists by onlyArtistId when set', async () => {
    const db = makeMockDb((table) => {
      if (table === 'artists') return { data: [mockArtist], error: null }
      return { data: [], error: null }
    })
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    })

    const deps: SyncAllDeps = {
      db,
      fetch: fetchFn as typeof fetch,
      uploadToR2: vi.fn().mockResolvedValue('https://cdn.example.com/image.jpg'),
      onlyArtistId: mockArtist.id,
    }

    const result = await syncAll(deps)
    // iTunes sync should process the one returned artist
    const itunesResult = result.results.find((r) => r.api === 'itunes')
    expect(itunesResult).toBeDefined()
    expect(itunesResult?.artistsProcessed).toBe(1)
  })
})

describe('syncSingleArtist', () => {
  it('returns a SyncAllResult for the specified artist', async () => {
    const db = makeMockDb((table) => {
      if (table === 'artists') return { data: [mockArtist], error: null }
      return { data: [], error: null }
    })
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    })
    const deps: SyncAllDeps = {
      db,
      fetch: fetchFn as typeof fetch,
      uploadToR2: vi.fn().mockResolvedValue('https://cdn.example.com/image.jpg'),
    }

    const result = await syncSingleArtist(mockArtist.id, 'full', deps)
    expect(result).toHaveProperty('results')
    expect(result).toHaveProperty('totalErrors')
    // full jobType runs all configured APIs — at minimum iTunes
    const itunesResult = result.results.find((r) => r.api === 'itunes')
    expect(itunesResult).toBeDefined()
    expect(itunesResult?.artistsProcessed).toBe(1)
  })

  it('maps spotify jobType to onlyApi=spotify, skipping iTunes', async () => {
    const db = makeMockDb((table) => {
      if (table === 'artists') return { data: [{ ...mockArtist, spotify_id: 'spot-1' }], error: null }
      return { data: [], error: null }
    })
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    })
    // No spotify credentials → spotify block is also skipped, but iTunes must not run
    const deps: SyncAllDeps = {
      db,
      fetch: fetchFn as typeof fetch,
      uploadToR2: vi.fn(),
    }

    const result = await syncSingleArtist(mockArtist.id, 'spotify', deps)
    expect(result.results.find((r) => r.api === 'itunes')).toBeUndefined()
  })

  it('uses latest release URL as Odesli proxy for artist platform_links', async () => {
    const artistWithSpotify = {
      ...mockArtist,
      id: 'artist-odesli',
      spotify_url: null,
      apple_music_url: null,
    }

    const odesliFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            pageUrl: 'https://song.link/s/proxy',
            linksByPlatform: { spotify: { url: 'https://open.spotify.com/album/album1' } },
          }),
        ),
    })

    const db = makeMockDb((table) => {
      if (table === 'artists') {
        return { data: [artistWithSpotify], error: null }
      }
      if (table === 'releases') {
        return {
          data: [
            {
              id: 'release-1',
              artist_id: 'artist-odesli',
              spotify_url: 'https://open.spotify.com/album/album1',
              apple_music_url: null,
              release_date: '2024-01-01',
            },
          ],
          error: null,
        }
      }
      if (table === 'sync_logs') return { data: null, error: null }
      return { data: [], error: null }
    })

    const deps: SyncAllDeps = {
      db,
      fetch: odesliFetch as typeof fetch,
      uploadToR2: vi.fn(),
      onlyApi: 'odesli',
    }

    const result = await syncAll(deps)
    const odesliResult = result.results.find((r) => r.api === 'odesli')
    expect(odesliResult).toBeDefined()

    const calledUrls = odesliFetch.mock.calls.map((call) => String(call[0]))
    expect(calledUrls.some((u) => u.includes('album1'))).toBe(true)
    expect(calledUrls.some((u) => u.includes('artist123'))).toBe(false)
    expect(odesliResult?.errors.filter((e) => e.includes('UNSUPPORTED_URL'))).toHaveLength(0)
  })

  it('maps discogs jobType to onlyApi=discogs, skipping iTunes', async () => {
    const db = makeMockDb((table) => {
      if (table === 'artists') return { data: [{ ...mockArtist, discogs_id: 'disc-1' }], error: null }
      return { data: [], error: null }
    })
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    })
    // No discogsToken → discogs block skipped, but iTunes must not run
    const deps: SyncAllDeps = {
      db,
      fetch: fetchFn as typeof fetch,
      uploadToR2: vi.fn(),
    }

    const result = await syncSingleArtist(mockArtist.id, 'discogs', deps)
    expect(result.results.find((r) => r.api === 'itunes')).toBeUndefined()
  })
})
