import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getReleases,
  getPublicReleases,
  getReleasesByArtistId,
  createRelease,
  deleteRelease,
  upsertReleaseByItunesId,
  upsertReleaseBySpotifyId,
  upsertReleaseByDiscogsId,
  getReleaseById,
} from './releases'

type DbClient = SupabaseClient<Database>
type ReleaseRow = Database['public']['Tables']['releases']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const mockReleaseRow: ReleaseRow = {
  id: 'rel-001',
  title: 'Polymorph',
  artist_id: 'art-001',
  release_date: '2024-03-15',
  cover_art: 'https://example.com/cover.jpg',
  type: 'album',
  spotify_url: 'https://open.spotify.com/album/polymorph',
  apple_music_url: null,
  youtube_url: null,
  featured: true,
  featured_until: null,
  featured_removed_reason: null,
  itunes_id: '123456789',
  spotify_id: null,
  discogs_id: null,
  isrc: null,
  barcode: null,
  catalog_number: null,
  preview_url: null,
  smart_url: null,
  popularity: null,
  is_visible: true,
  is_promo: false,
  promo_text: null,
  hero_bg_url: null,
  platform_links: null,
  hero_primary_btn_label: null,
  hero_primary_btn_action: null,
  hero_primary_btn_href: null,
  hero_secondary_btn_label: null,
  hero_secondary_btn_href: null,
  hero_secondary_btn_action: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  bandcamp_url: null,
  smartlink_url: null,
  guest_artists: null,
}

describe('getReleases', () => {
  it('returns an empty array when there are no releases', async () => {
    const db = makeMockDb([])
    const result = await getReleases(db)
    expect(result).toEqual([])
  })

  it('maps rows to Release domain objects', async () => {
    const db = makeMockDb([mockReleaseRow])
    const result = await getReleases(db)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Polymorph')
    expect(result[0].artistName).toBe('')
    expect(result[0].type).toBe('album')
    expect(result[0].featured).toBe(true)
    expect(result[0].isVisible).toBe(true)
  })

  it('throws on error', async () => {
    const db = makeMockDb(null, { message: 'Connection error', code: 'PGRST001' })
    await expect(getReleases(db)).rejects.toThrow('Connection error')
  })

  it('maps is_visible=false to isVisible=false', async () => {
    const db = makeMockDb([{ ...mockReleaseRow, is_visible: false }])
    const result = await getReleases(db)
    expect(result[0].isVisible).toBe(false)
  })
})

describe('getPublicReleases', () => {
  it('filters by is_visible=true and skips hidden-artist check when no hidden artists', async () => {
    // First call (artists): no hidden artists
    const artistBuilder = makeBuilder([], null)
    // Second call (releases): returns the visible release
    const releaseBuilder = makeBuilder([mockReleaseRow], null)
    // Third call (release_artists junction): no multi-artist data
    const junctionBuilder = makeBuilder([], null)
    // Fourth call (fallback artists lookup): maps legacy artist_id
    const fallbackArtistBuilder = makeBuilder([{ id: 'art-001', name: 'Artist One', slug: 'artist-one' }], null)

    const db = {
      from: vi.fn()
        .mockReturnValueOnce(artistBuilder)
        .mockReturnValueOnce(releaseBuilder)
        .mockReturnValueOnce(junctionBuilder)
        .mockReturnValueOnce(fallbackArtistBuilder),
    } as unknown as DbClient

    const result = await getPublicReleases(db)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Polymorph')
    // Verifies the is_visible filter was applied to releases
    expect(releaseBuilder.eq).toHaveBeenCalledWith('is_visible', true)
    // Should NOT call .or() to exclude artist IDs when no hidden artists exist
    expect(releaseBuilder.or).not.toHaveBeenCalled()
  })

  it('excludes releases from hidden artists (cascading visibility)', async () => {
    const hiddenArtistId = 'art-hidden'
    // First call (artists): returns one hidden artist
    const artistBuilder = makeBuilder([{ id: hiddenArtistId }], null)
    // Second call (releases): empty (since we filter them out)
    const releaseBuilder = makeBuilder([], null)

    const db = {
      from: vi.fn()
        .mockReturnValueOnce(artistBuilder)
        .mockReturnValueOnce(releaseBuilder),
    } as unknown as DbClient

    const result = await getPublicReleases(db)
    expect(result).toEqual([])
    // Verifies the cascading artist filter was applied
    expect(releaseBuilder.or).toHaveBeenCalledWith(
      `artist_id.is.null,artist_id.not.in.(${hiddenArtistId})`,
    )
  })

  it('returns an empty array when no visible releases exist', async () => {
    const artistBuilder = makeBuilder([], null)
    const releaseBuilder = makeBuilder([], null)

    const db = {
      from: vi.fn()
        .mockReturnValueOnce(artistBuilder)
        .mockReturnValueOnce(releaseBuilder),
    } as unknown as DbClient

    const result = await getPublicReleases(db)
    expect(result).toEqual([])
  })

  it('throws when the artist visibility query fails', async () => {
    const artistBuilder = makeBuilder(null, { message: 'DB error', code: 'PGRST001' })

    const db = {
      from: vi.fn().mockReturnValue(artistBuilder),
    } as unknown as DbClient

    await expect(getPublicReleases(db)).rejects.toThrow('DB error')
  })
})

describe('getReleasesByArtistId', () => {
  it('returns an empty array when no releases exist for artist', async () => {
    const db = makeMockDb([])
    await expect(getReleasesByArtistId(db, 'art-001')).resolves.toEqual([])
  })

  it('maps rows to Release domain objects for the given artist', async () => {
    const db = makeMockDb([mockReleaseRow])
    const result = await getReleasesByArtistId(db, 'art-001')
    expect(result).toHaveLength(1)
    expect(result[0].artistId).toBe('art-001')
    expect(result[0].title).toBe('Polymorph')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Artist releases failed', code: 'PGRST001' })
    await expect(getReleasesByArtistId(db, 'art-001')).rejects.toThrow('Artist releases failed')
  })
})

describe('getReleaseById', () => {
  it('returns null when not found (PGRST116)', async () => {
    const db = makeMockDb(null, { message: 'Not found', code: 'PGRST116' })
    const result = await getReleaseById(db, 'nonexistent')
    expect(result).toBeNull()
  })

  it('returns mapped Release for found row with attached artist name', async () => {
    const releaseBuilder = makeBuilder(mockReleaseRow)
    const junctionBuilder = makeBuilder([], null)
    const fallbackArtistBuilder = makeBuilder(
      [{ id: 'art-001', name: 'Artist One', slug: 'artist-one' }],
      null,
    )

    const db = {
      from: vi.fn()
        .mockReturnValueOnce(releaseBuilder)
        .mockReturnValueOnce(junctionBuilder)
        .mockReturnValueOnce(fallbackArtistBuilder),
    } as unknown as DbClient

    const result = await getReleaseById(db, mockReleaseRow.id)
    expect(result?.title).toBe('Polymorph')
    expect(result?.itunesId).toBe('123456789')
    expect(result?.isVisible).toBe(true)
    expect(result?.artistName).toBe('Artist One')
  })
})

describe('createRelease', () => {
  it('returns the created Release', async () => {
    const db = makeMockDb(mockReleaseRow)
    const result = await createRelease(db, {
      title: 'Polymorph',
      release_date: '2024-03-15',
      type: 'album',
    })
    expect(result.id).toBe('rel-001')
    expect(result.title).toBe('Polymorph')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Insert failed', code: 'PGRST001' })
    await expect(
      createRelease(db, {
        title: 'Test',
        release_date: '2024-01-01',
        type: 'single',
      }),
    ).rejects.toThrow('Insert failed')
  })

  it('throws when no data returned', async () => {
    const db = makeMockDb(null)
    await expect(
      createRelease(db, {
        title: 'Test',
        release_date: '2024-01-01',
        type: 'single',
      }),
    ).rejects.toThrow('No data returned from createRelease')
  })
})

describe('deleteRelease', () => {
  it('resolves without error on success', async () => {
    const db = makeMockDb(null, null)
    await expect(deleteRelease(db, 'rel-001')).resolves.toBeUndefined()
  })

  it('throws when deletion fails', async () => {
    const db = makeMockDb(null, { message: 'Delete denied', code: 'PGRST301' })
    await expect(deleteRelease(db, 'rel-001')).rejects.toThrow('Delete denied')
  })
})

describe('upsertReleaseByItunesId', () => {
  it('returns the upserted Release', async () => {
    const db = makeMockDb(mockReleaseRow)
    const result = await upsertReleaseByItunesId(db, {
      title: 'Polymorph',
      release_date: '2024-03-15',
      type: 'album',
      itunes_id: '123456789',
    })
    expect(result.itunesId).toBe('123456789')
  })

  it('throws on conflict error', async () => {
    const db = makeMockDb(null, { message: 'Upsert error', code: 'PGRST001' })
    await expect(
      upsertReleaseByItunesId(db, {
        title: 'Test',
        release_date: '2024-01-01',
        type: 'single',
        itunes_id: '999',
      }),
    ).rejects.toThrow('Upsert error')
  })

  it('preserves featured when the release already exists', async () => {
    const existingBuilder = makeBuilder({ id: 'rel-001', featured: true })
    const upsertBuilder = makeBuilder({ ...mockReleaseRow, featured: true })
    const db = {
      from: vi
        .fn()
        .mockReturnValueOnce(existingBuilder)
        .mockReturnValueOnce(upsertBuilder),
    } as unknown as DbClient

    const result = await upsertReleaseByItunesId(db, {
      title: 'Polymorph',
      release_date: '2024-03-15',
      type: 'album',
      itunes_id: '123456789',
      featured: false,
    })

    expect(result.featured).toBe(true)
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ featured: true }),
      { onConflict: 'itunes_id' },
    )
  })
})

describe('upsertReleaseBySpotifyId', () => {
  it('upserts with onConflict spotify_id', async () => {
    const existingBuilder = makeBuilder({ id: 'rel-001', featured: false })
    const upsertBuilder = makeBuilder({ ...mockReleaseRow, spotify_id: 'sp-1' })
    const db = {
      from: vi.fn().mockReturnValueOnce(existingBuilder).mockReturnValueOnce(upsertBuilder),
    } as unknown as DbClient

    const result = await upsertReleaseBySpotifyId(db, {
      title: 'Test',
      release_date: '2024-01-01',
      type: 'single',
      spotify_id: 'sp-1',
    })

    expect(result.spotifyId).toBe('sp-1')
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ spotify_id: 'sp-1' }),
      { onConflict: 'spotify_id' },
    )
  })
})

describe('upsertReleaseByDiscogsId', () => {
  it('upserts with onConflict discogs_id', async () => {
    const existingBuilder = makeBuilder({ id: 'rel-001', featured: false })
    const upsertBuilder = makeBuilder({ ...mockReleaseRow, discogs_id: 'dc-1' })
    const db = {
      from: vi.fn().mockReturnValueOnce(existingBuilder).mockReturnValueOnce(upsertBuilder),
    } as unknown as DbClient

    const result = await upsertReleaseByDiscogsId(db, {
      title: 'Test',
      release_date: '2024-01-01',
      type: 'album',
      discogs_id: 'dc-1',
    })

    expect(result.discogsId).toBe('dc-1')
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ discogs_id: 'dc-1' }),
      { onConflict: 'discogs_id' },
    )
  })
})
