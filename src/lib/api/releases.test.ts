import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getReleases,
  getPublicReleases,
  getAllVisibleReleasesForCalendar,
  getReleasesByArtistId,
  createRelease,
  deleteRelease,
  upsertReleaseByItunesId,
  upsertReleaseBySpotifyId,
  upsertReleaseByDiscogsId,
  getReleaseById,
  syncReleaseFromExternalSource,
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
  organization_id: '00000000-0000-0000-0000-000000000000',
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
  sync_policy: 'auto' as const,
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

describe('getAllVisibleReleasesForCalendar', () => {
  it('maps nested release_artists in a single select (no extra junction round-trips)', async () => {
    const calendarRow = {
      id: 'rel-cal-1',
  organization_id: '00000000-0000-0000-0000-000000000000',
      title: 'Calendar Cut',
      artist_id: 'art-001',
      release_date: '2025-06-01',
      cover_art: 'https://example.com/c.jpg',
      type: 'single' as const,
      spotify_url: 'https://open.spotify.com/album/x',
      apple_music_url: null,
      youtube_url: null,
      bandcamp_url: null,
      smartlink_url: 'https://example.com/presave',
      platform_links: { deezer: 'https://deezer.com/x' },
      is_visible: true,
      is_promo: false,
      promo_text: 'Promo note',
      release_artists: [
        {
          sort_order: 0,
          artists: { id: 'art-001', name: 'Visible Band', slug: 'visible-band', is_visible: true },
        },
      ],
    }
    const releaseBuilder = makeBuilder([calendarRow], null)
    const db = {
      from: vi.fn().mockReturnValue(releaseBuilder),
    } as unknown as DbClient

    const result = await getAllVisibleReleasesForCalendar(db)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Calendar Cut')
    expect(result[0].artistName).toBe('Visible Band')
    expect(result[0].artists).toEqual([
      { id: 'art-001', name: 'Visible Band', slug: 'visible-band' },
    ])
    expect(result[0].smartlinkUrl).toBe('https://example.com/presave')
    expect(result[0].platformLinks).toEqual({ deezer: 'https://deezer.com/x' })
    expect(releaseBuilder.eq).toHaveBeenCalledWith('is_visible', true)
    expect(releaseBuilder.eq).toHaveBeenCalledWith('is_promo', false)
    expect(releaseBuilder.limit).toHaveBeenCalled()
    // Nested artists already present → no second from('artists') call
    expect(db.from).toHaveBeenCalledTimes(1)
  })

  it('drops releases whose only junction artists are hidden', async () => {
    const calendarRow = {
      id: 'rel-hidden',
      title: 'Hidden Only',
      artist_id: 'art-hidden',
      release_date: '2025-01-01',
      cover_art: null,
      type: 'album' as const,
      spotify_url: null,
      apple_music_url: null,
      youtube_url: null,
      bandcamp_url: null,
      smartlink_url: null,
      platform_links: null,
      is_visible: true,
      is_promo: false,
      promo_text: null,
      release_artists: [
        {
          sort_order: 0,
          artists: { id: 'art-hidden', name: 'Ghost', slug: 'ghost', is_visible: false },
        },
      ],
    }
    const db = {
      from: vi.fn().mockReturnValue(makeBuilder([calendarRow], null)),
    } as unknown as DbClient

    const result = await getAllVisibleReleasesForCalendar(db)
    expect(result).toEqual([])
  })

  it('resolves legacy artist_id when junction is empty and filters hidden', async () => {
    const calendarRow = {
      id: 'rel-legacy',
      title: 'Legacy Cut',
      artist_id: 'art-001',
      release_date: '2024-01-01',
      cover_art: null,
      type: 'ep' as const,
      spotify_url: null,
      apple_music_url: null,
      youtube_url: null,
      bandcamp_url: null,
      smartlink_url: null,
      platform_links: null,
      is_visible: true,
      is_promo: false,
      promo_text: null,
      release_artists: [],
    }
    const releaseBuilder = makeBuilder([calendarRow], null)
    const artistBuilder = makeBuilder(
      [{ id: 'art-001', name: 'Legacy Artist', slug: 'legacy', is_visible: true }],
      null,
    )
    const db = {
      from: vi.fn()
        .mockReturnValueOnce(releaseBuilder)
        .mockReturnValueOnce(artistBuilder),
    } as unknown as DbClient

    const result = await getAllVisibleReleasesForCalendar(db)
    expect(result).toHaveLength(1)
    expect(result[0].artistName).toBe('Legacy Artist')
    expect(result[0].artists?.[0]?.slug).toBe('legacy')
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

// ---------------------------------------------------------------------------
// syncReleaseFromExternalSource — exact-ID guards (Fixes 1 & 2)
// ---------------------------------------------------------------------------

describe('syncReleaseFromExternalSource — spotify exact-ID guard', () => {
  it('updates the row that already owns the spotify_id instead of fuzzy-matching', async () => {
    // Row that already owns spotify_id = 'sp-1'
    const existingByIdBuilder = makeBuilder({
      id: 'rel-existing',
      title: 'My Enemy',
      release_date: '2022-01-01',
      spotify_id: 'sp-1',
      itunes_id: null,
      discogs_id: null,
      isrc: null,
      barcode: null,
    })
    // UPDATE response (returned as the updated row)
    const updateBuilder = makeBuilder({ ...mockReleaseRow, id: 'rel-existing', spotify_id: 'sp-1' })

    const db = {
      from: vi.fn()
        .mockReturnValueOnce(existingByIdBuilder) // findReleaseByExternalId
        .mockReturnValueOnce(updateBuilder),       // UPDATE .eq('id', ...)
    } as unknown as DbClient

    const result = await syncReleaseFromExternalSource(
      db,
      'spotify',
      {
        title: 'My Enemy',
        release_date: '2022-01-01',
        type: 'single',
        spotify_id: 'sp-1',
      },
      [],
    )

    expect(result.release.id).toBe('rel-existing')
    expect(result.merged).toBe(true)
    // The UPDATE must target the row that owns the ID, not an unrelated row
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'rel-existing')
    // No upsert should have been called (guard short-circuits)
    expect(updateBuilder.upsert).not.toHaveBeenCalled()
  })

  it('falls through to upsert when no row owns the spotify_id yet', async () => {
    // findReleaseByExternalId returns null (no existing row with this ID)
    const noExistingBuilder = makeBuilder(null)
    // preserveFeaturedByColumn check (maybeSingle)
    const featuredBuilder = makeBuilder(null)
    // upsertReleaseBySpotifyId response
    const upsertBuilder = makeBuilder({ ...mockReleaseRow, spotify_id: 'sp-new' })

    const db = {
      from: vi.fn()
        .mockReturnValueOnce(noExistingBuilder) // findReleaseByExternalId
        .mockReturnValueOnce(featuredBuilder)   // preserveFeaturedByColumn
        .mockReturnValueOnce(upsertBuilder),    // upsert
    } as unknown as DbClient

    const result = await syncReleaseFromExternalSource(
      db,
      'spotify',
      {
        title: 'New Release',
        release_date: '2024-01-01',
        type: 'single',
        spotify_id: 'sp-new',
      },
      [],
    )

    expect(result.merged).toBe(false)
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ spotify_id: 'sp-new' }),
      { onConflict: 'spotify_id' },
    )
  })
})

describe('syncReleaseFromExternalSource — discogs exact-ID guard', () => {
  it('updates the row that already owns the discogs_id instead of fuzzy-matching', async () => {
    const existingByIdBuilder = makeBuilder({
      id: 'rel-dc',
      title: 'Vinyl Release',
      release_date: '2021-06-01',
      spotify_id: null,
      itunes_id: null,
      discogs_id: 'dc-1',
      isrc: null,
      barcode: null,
    })
    const updateBuilder = makeBuilder({ ...mockReleaseRow, id: 'rel-dc', discogs_id: 'dc-1' })

    const db = {
      from: vi.fn()
        .mockReturnValueOnce(existingByIdBuilder) // findReleaseByExternalId
        .mockReturnValueOnce(updateBuilder),       // UPDATE
    } as unknown as DbClient

    const result = await syncReleaseFromExternalSource(
      db,
      'discogs',
      {
        title: 'Vinyl Release',
        release_date: '2021-06-01',
        type: 'album',
        discogs_id: 'dc-1',
      },
      [],
    )

    expect(result.release.id).toBe('rel-dc')
    expect(result.merged).toBe(true)
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'rel-dc')
    expect(updateBuilder.upsert).not.toHaveBeenCalled()
  })
})
