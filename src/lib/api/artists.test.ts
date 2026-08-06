import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getArtists, getPublicArtists, createArtist, updateArtist, deleteArtist, getArtistById, getArtistBySlug, getRelatedArtists } from './artists'

type DbClient = SupabaseClient<Database>
type ArtistRow = Database['public']['Tables']['artists']['Row']

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
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const mockArtistRow: ArtistRow = {
  id: 'abc-123',
  name: 'C Z A R I N A',
  slug: 'czarina',
  bio: 'Dark electronic pop',
  genres: ['Darkpop', 'Industrial'],
  image_url: 'https://example.com/img.jpg',
  spotify_url: 'https://open.spotify.com/artist/czarina',
  apple_music_url: null,
  instagram_url: null,
  youtube_url: null,
  website_url: null,
  featured: true,
  country: 'USA',
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
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('getArtists', () => {
  it('returns an empty array when there are no artists', async () => {
    const db = makeMockDb([])
    const result = await getArtists(db)
    expect(result).toEqual([])
  })

  it('maps rows to Artist domain objects', async () => {
    const db = makeMockDb([mockArtistRow])
    const result = await getArtists(db)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('C Z A R I N A')
    expect(result[0].id).toBe('abc-123')
    expect(result[0].genres).toEqual(['Darkpop', 'Industrial'])
    expect(result[0].isVisible).toBe(true)
  })

  it('falls back to a slug generated from name when row slug is empty', async () => {
    const db = makeMockDb([{ ...mockArtistRow, slug: '' }])
    const result = await getArtists(db)
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('c-z-a-r-i-n-a')
  })

  it('falls back to a normalized slug for names with unicode characters', async () => {
    const db = makeMockDb([{ ...mockArtistRow, name: 'Mötley Crüe ß', slug: '   ' }])
    const result = await getArtists(db)
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('moetley-cruee-ss')
  })

  it('throws on error', async () => {
    const db = makeMockDb(null, { message: 'DB error', code: 'PGRST001' })
    await expect(getArtists(db)).rejects.toThrow('DB error')
  })

  it('maps is_visible=false to isVisible=false', async () => {
    const db = makeMockDb([{ ...mockArtistRow, is_visible: false }])
    const result = await getArtists(db)
    expect(result[0].isVisible).toBe(false)
  })
})

describe('getPublicArtists', () => {
  it('returns only visible artists (applies is_visible filter)', async () => {
    const builder = makeBuilder([mockArtistRow])
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as DbClient
    const result = await getPublicArtists(db)
    expect(result).toHaveLength(1)
    expect(builder.eq).toHaveBeenCalledWith('is_visible', true)
  })

  it('returns an empty array when no visible artists exist', async () => {
    const db = makeMockDb([])
    const result = await getPublicArtists(db)
    expect(result).toEqual([])
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Connection error', code: 'PGRST001' })
    await expect(getPublicArtists(db)).rejects.toThrow('Connection error')
  })
})

describe('getArtistById', () => {
  it('returns null when artist not found (PGRST116)', async () => {
    const db = makeMockDb(null, { message: 'Not found', code: 'PGRST116' })
    const result = await getArtistById(db, 'nonexistent')
    expect(result).toBeNull()
  })

  it('throws for non-PGRST116 errors', async () => {
    const db = makeMockDb(null, { message: 'Permission denied', code: 'PGRST301' })
    await expect(getArtistById(db, 'some-id')).rejects.toThrow('Permission denied')
  })

  it('returns mapped Artist for found row', async () => {
    const db = makeMockDb(mockArtistRow)
    const result = await getArtistById(db, mockArtistRow.id)
    expect(result).not.toBeNull()
    expect(result?.name).toBe('C Z A R I N A')
    expect(result?.featured).toBe(true)
    expect(result?.isVisible).toBe(true)
  })
})

describe('getArtistBySlug', () => {
  it('returns null when artist not found', async () => {
    const first = makeBuilder(null, null)
    const second = makeBuilder([], null)
    const privateEmpty = makeBuilder([], null)
    const db = {
      from: vi
        .fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second)
        .mockReturnValue(privateEmpty),
    } as unknown as DbClient
    const result = await getArtistBySlug(db, 'nonexistent-slug')
    expect(result).toBeNull()
  })

  it('throws for direct slug lookup errors', async () => {
    const db = makeMockDb(null, { message: 'Permission denied', code: 'PGRST301' })
    await expect(getArtistBySlug(db, 'czarina')).rejects.toThrow('Permission denied')
  })

  it('throws for fallback null/empty slug lookup errors', async () => {
    const first = makeBuilder(null, null)
    const second = makeBuilder(null, { message: 'Fallback failed', code: 'PGRST301' })
    const db = {
      from: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
    } as unknown as DbClient
    await expect(getArtistBySlug(db, 'czarina')).rejects.toThrow('Fallback failed')
  })

  it('returns mapped Artist for found row', async () => {
    const db = makeMockDb(mockArtistRow)
    const result = await getArtistBySlug(db, mockArtistRow.slug)
    expect(result).not.toBeNull()
    expect(result?.slug).toBe('czarina')
    expect(result?.name).toBe('C Z A R I N A')
  })

  it('falls back to generated slug when stored slug is null/empty', async () => {
    const first = makeBuilder(null, null)
    const second = makeBuilder([{ ...mockArtistRow, slug: null }], null)
    const privateEmpty = makeBuilder([], null)
    const db = {
      from: vi
        .fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second)
        .mockReturnValue(privateEmpty),
    } as unknown as DbClient
    const result = await getArtistBySlug(db, 'c-z-a-r-i-n-a')
    expect(result).not.toBeNull()
    expect(result?.slug).toBe('c-z-a-r-i-n-a')
  })
})

describe('createArtist', () => {
  it('returns the created Artist', async () => {
    const db = makeMockDb(mockArtistRow)
    const result = await createArtist(db, {
      name: 'C Z A R I N A',
      slug: 'czarina',
    })
    expect(result.id).toBe('abc-123')
    expect(result.name).toBe('C Z A R I N A')
  })

  it('throws when error is returned', async () => {
    const db = makeMockDb(null, { message: 'Unique constraint violation', code: '23505' })
    await expect(createArtist(db, { name: 'Test', slug: 'test' })).rejects.toThrow(
      'Unique constraint violation',
    )
  })

  it('throws when no data is returned', async () => {
    const db = makeMockDb(null)
    await expect(createArtist(db, { name: 'Test', slug: 'test' })).rejects.toThrow(
      'No data returned from createArtist',
    )
  })
})

describe('updateArtist', () => {
  it('returns the updated Artist', async () => {
    const updated = { ...mockArtistRow, name: 'Updated Name' }
    const db = makeMockDb(updated)
    const result = await updateArtist(db, mockArtistRow.id, { name: 'Updated Name' })
    expect(result.name).toBe('Updated Name')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Update failed', code: 'PGRST001' })
    await expect(updateArtist(db, 'some-id', { name: 'X' })).rejects.toThrow('Update failed')
  })

  it('can toggle visibility off', async () => {
    const hidden = { ...mockArtistRow, is_visible: false }
    const db = makeMockDb(hidden)
    const result = await updateArtist(db, mockArtistRow.id, { is_visible: false })
    expect(result.isVisible).toBe(false)
  })
})

describe('deleteArtist', () => {
  it('resolves without error on success', async () => {
    const db = makeMockDb(null, null)
    await expect(deleteArtist(db, 'abc-123')).resolves.toBeUndefined()
  })

  it('throws when deletion fails', async () => {
    const db = makeMockDb(null, { message: 'Delete denied', code: 'PGRST301' })
    await expect(deleteArtist(db, 'abc-123')).rejects.toThrow('Delete denied')
  })

  it('calls delete on the artists table (cascades to releases/concerts in DB)', async () => {
    const builder = makeBuilder(null, null)
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as DbClient
    await deleteArtist(db, 'abc-123')
    expect(db.from).toHaveBeenCalledWith('artists')
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('id', 'abc-123')
  })
})

describe('getRelatedArtists', () => {
  const relatedRow: ArtistRow = {
    ...mockArtistRow,
    id: 'related-1',
    name: 'Related Artist',
    slug: 'related-artist',
    genres: ['Darkpop'],
  }

  it('returns related artists matching the genres', async () => {
    const db = makeMockDb([relatedRow])
    const result = await getRelatedArtists(db, mockArtistRow.id, ['Darkpop'])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Related Artist')
  })

  it('returns empty array when genres is empty (no query)', async () => {
    const db = makeMockDb([relatedRow])
    const result = await getRelatedArtists(db, mockArtistRow.id, [])
    expect(result).toHaveLength(0)
    // Supabase should not be called
    expect((db as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'DB error', code: 'PGRST001' })
    await expect(getRelatedArtists(db, 'id-1', ['Rock'])).rejects.toThrow('DB error')
  })

  it('uses filter with ov operator to find genre overlap', async () => {
    const builder = makeBuilder([relatedRow], null)
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as DbClient
    await getRelatedArtists(db, 'id-1', ['Darkpop', 'EBM'])
    expect(builder.filter).toHaveBeenCalledWith('genres', 'ov', '{Darkpop,EBM}')
  })
})
