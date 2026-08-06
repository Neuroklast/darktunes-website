import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Artist } from '@/types'
import {
  PUBLIC_ARTIST_COLUMNS,
  PRIVATE_ARTIST_COLUMN_NAMES,
  toPublicArtist,
  artistToPublicArtist,
  getPublicArtists,
  getPublicArtistBySlug,
} from './publicArtist'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const publicRow = {
  id: 'abc-123',
  name: 'C Z A R I N A',
  slug: 'czarina',
  bio: 'Dark electronic pop',
  genres: ['Darkpop'],
  image_url: 'https://example.com/img.jpg',
  spotify_url: null,
  apple_music_url: null,
  instagram_url: null,
  youtube_url: null,
  website_url: null,
  facebook_url: null,
  twitter_url: null,
  tiktok_url: null,
  bandcamp_url: null,
  shop_url: null,
  soundcloud_url: null,
  featured: true,
  country: 'USA',
  founding_year: 2018,
  hometown: 'Berlin',
  spotify_id: null,
  discogs_id: null,
  songkick_id: null,
  bandsintown_id: 'bt-1',
  lastfm_name: null,
  soundcharts_id: null,
  is_visible: true,
  logo_url: null,
  platform_links: null,
  smart_links: null,
  image_position_x: 50,
  image_position_y: 50,
  image_scale: 1,
}

describe('PUBLIC_ARTIST_COLUMNS', () => {
  it('never includes private column names', () => {
    for (const col of PRIVATE_ARTIST_COLUMN_NAMES) {
      expect(PUBLIC_ARTIST_COLUMNS.split(',')).not.toContain(col)
    }
  })
})

describe('toPublicArtist', () => {
  it('maps public fields and omits secrets', () => {
    const artist = toPublicArtist(publicRow)
    expect(artist.name).toBe('C Z A R I N A')
    expect(artist.bandsintownId).toBe('bt-1')
    expect(artist).not.toHaveProperty('bandsintownApiKey')
    expect(artist).not.toHaveProperty('email')
    expect(artist).not.toHaveProperty('vatNumber')
    expect(artist).not.toHaveProperty('notes')
    expect(artist).not.toHaveProperty('userId')
    expect(artist).not.toHaveProperty('storageQuotaBytes')
  })
})

describe('artistToPublicArtist', () => {
  it('strips secrets from a full Artist domain object', () => {
    const full = {
      id: '1',
      name: 'X',
      slug: 'x',
      bio: '',
      genres: [],
      imageUrl: '',
      featured: false,
      isVisible: true,
      email: 'secret@example.com',
      vatNumber: 'DE1',
      notes: 'internal',
      bandsintownApiKey: 'super-secret',
      userId: 'user-1',
      storageQuotaBytes: 99,
    } as Artist
    const pub = artistToPublicArtist(full)
    expect(pub).not.toHaveProperty('bandsintownApiKey')
    expect(pub).not.toHaveProperty('email')
    expect(JSON.stringify(pub)).not.toContain('super-secret')
    expect(JSON.stringify(pub)).not.toContain('secret@example.com')
  })
})

describe('getPublicArtists', () => {
  it('selects only public columns and filters is_visible', async () => {
    const builder = makeBuilder([publicRow])
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as DbClient
    const result = await getPublicArtists(db)
    expect(builder.select).toHaveBeenCalledWith(PUBLIC_ARTIST_COLUMNS)
    expect(builder.eq).toHaveBeenCalledWith('is_visible', true)
    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('bandsintownApiKey')
  })
})

describe('getPublicArtistBySlug', () => {
  it('returns null when not found', async () => {
    const first = makeBuilder(null, null)
    const second = makeBuilder([], null)
    const db = {
      from: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
    } as unknown as DbClient
    const result = await getPublicArtistBySlug(db, 'missing')
    expect(result).toBeNull()
  })

  it('maps a found public row', async () => {
    const db = makeMockDb(publicRow)
    const result = await getPublicArtistBySlug(db, 'czarina')
    expect(result?.slug).toBe('czarina')
    expect(result).not.toHaveProperty('email')
  })
})
