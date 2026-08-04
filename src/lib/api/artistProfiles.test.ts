import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getArtistProfileByArtistId,
  upsertArtistProfile,
  getArtistByUserId,
  getArtistsByUserId,
  resolvePortalArtist,
  isProfileComplete,
  type ArtistProfile,
} from './artistProfiles'
import { rowToArtist } from './artistRowMapper'

type DbClient = SupabaseClient<Database>
type ArtistProfileRow = Database['public']['Tables']['artist_epks']['Row']
type ArtistRow = Database['public']['Tables']['artists']['Row']

// Builder that returns different data per table call
function makeSequentialDb(calls: Array<{ data: unknown; error: unknown }>): DbClient {
  let callIndex = 0
  const makeBuilder = (data: unknown, error: unknown) => {
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
      in: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: p.then.bind(p),
      catch: p.catch.bind(p),
      finally: p.finally.bind(p),
    }
  }
  return {
    from: vi.fn().mockImplementation(() => {
      const call = calls[callIndex] ?? { data: null, error: null }
      callIndex++
      return makeBuilder(call.data, call.error)
    }),
  } as unknown as DbClient
}

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

const mockProfileRow: ArtistProfileRow = {
  id: 'profile-uuid',
  artist_id: 'artist-uuid',
  bio_short: null,
  bio_medium: null,
  bio_long: null,
  press_quote: '"Outstanding!" — Darkroom Magazine',
  booking_contact: null,
  press_contact: null,
  rider_stage_plot_url: null,
  rider_technical_url: null,
  rider_hospitality_url: null,
  onboarding_completed: false,
  epk_theme: 'default',
  epk_layout: 'classic',
  epk_orientation: 'portrait',
  epk_bg_image_url: null,
  epk_bg_opacity: 20,
  epk_sections_order: [],
  epk_sections_hidden: [],
  epk_password_hash: null,
  epk_password_sections: [],
  epk_gallery_photos: [],
  epk_custom_theme_tokens: null,
  custom_links: null,
  epk_document: null,
  epk_document_version: 1,
  epk_editor_mode: 'legacy',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockArtistRow: ArtistRow = {
  id: 'artist-uuid',
  name: 'C Z A R I N A',
  slug: 'czarina',
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
  user_id: 'auth-user-uuid',
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

describe('getArtistProfileByArtistId', () => {
  it('returns mapped ArtistProfile for a found row', async () => {
    const db = makeMockDb(mockProfileRow)
    const result = await getArtistProfileByArtistId(db, 'artist-uuid')
    expect(result).not.toBeNull()
    expect(result?.artistId).toBe('artist-uuid')
    expect(result?.pressQuote).toBe('"Outstanding!" — Darkroom Magazine')
    expect(result?.epkLayout).toBe('classic')
    expect(result?.epkOrientation).toBe('portrait')
    expect(result?.epkBgOpacity).toBe(20)
  })

  it('returns null when profile not found (PGRST116)', async () => {
    const db = makeMockDb(null, { message: 'Not found', code: 'PGRST116' })
    const result = await getArtistProfileByArtistId(db, 'nonexistent')
    expect(result).toBeNull()
  })

  it('throws for non-PGRST116 errors', async () => {
    const db = makeMockDb(null, { message: 'Permission denied', code: 'PGRST301' })
    await expect(getArtistProfileByArtistId(db, 'some-id')).rejects.toThrow('Permission denied')
  })

  it('maps valid custom_links JSON', async () => {
    const db = makeMockDb({
      ...mockProfileRow,
      custom_links: [{ label: 'Shop', url: 'https://shop.example' }],
    })
    const result = await getArtistProfileByArtistId(db, 'artist-uuid')
    expect(result?.customLinks).toEqual([{ label: 'Shop', url: 'https://shop.example' }])
  })

  it('ignores malformed custom_links JSON', async () => {
    const db = makeMockDb({
      ...mockProfileRow,
      custom_links: [{ label: 'Broken link' }],
    })
    const result = await getArtistProfileByArtistId(db, 'artist-uuid')
    expect(result?.customLinks).toEqual([])
  })
})

describe('upsertArtistProfile', () => {
  it('returns the upserted ArtistProfile', async () => {
    const db = makeMockDb(mockProfileRow)
    const result = await upsertArtistProfile(db, {
      artist_id: 'artist-uuid',
      bio_short: 'Short bio for test',
    })
    expect(result.artistId).toBe('artist-uuid')
    expect(result.bioShort).toBeUndefined()
  })

  it('throws when error is returned', async () => {
    const db = makeMockDb(null, { message: 'Conflict error', code: '23505' })
    await expect(upsertArtistProfile(db, { artist_id: 'artist-uuid', bio_short: 'Test' })).rejects.toThrow(
      'Conflict error',
    )
  })

  it('throws when no data is returned', async () => {
    const db = makeMockDb(null)
    await expect(upsertArtistProfile(db, { artist_id: 'artist-uuid' })).rejects.toThrow(
      'No data returned from upsertArtistProfile',
    )
  })
})

describe('getArtistByUserId', () => {
  it('returns mapped artist when user has an artist_members membership', async () => {
    // Call 1: artist_members query → returns membership row
    // Call 2: artists query → returns artist row
    const db = makeSequentialDb([
      { data: { artist_id: 'artist-uuid' }, error: null },
      { data: mockArtistRow, error: null },
    ])
    const result = await getArtistByUserId(db, 'auth-user-uuid')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('artist-uuid')
    expect(result?.name).toBe('C Z A R I N A')
  })

  it('returns null when user has no artist memberships', async () => {
    // Call 1: artist_members query → no membership
    const db = makeSequentialDb([{ data: null, error: null }])
    const result = await getArtistByUserId(db, 'unlinked-user')
    expect(result).toBeNull()
  })

  it('throws for DB errors on artist_members query', async () => {
    const db = makeSequentialDb([{ data: null, error: { message: 'DB failure', code: 'PGRST001' } }])
    await expect(getArtistByUserId(db, 'user-id')).rejects.toThrow('DB failure')
  })
})

describe('getArtistsByUserId', () => {
  it('returns all artists for a user with multiple memberships', async () => {
    const artistRow2: ArtistRow = { ...mockArtistRow, id: 'artist-uuid-2', name: 'Band B', slug: 'band-b' }
    // Call 1: artist_members → two memberships
    // Call 2: artists .in() → two artist rows
    const db = makeSequentialDb([
      { data: [{ artist_id: 'artist-uuid' }, { artist_id: 'artist-uuid-2' }], error: null },
      { data: [mockArtistRow, artistRow2], error: null },
    ])
    const result = await getArtistsByUserId(db, 'auth-user-uuid')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('artist-uuid')
    expect(result[1].id).toBe('artist-uuid-2')
  })

  it('returns empty array when user has no memberships', async () => {
    const db = makeSequentialDb([{ data: [], error: null }])
    const result = await getArtistsByUserId(db, 'no-artist-user')
    expect(result).toEqual([])
  })

  it('throws for DB errors on artist_members query', async () => {
    const db = makeSequentialDb([{ data: null, error: { message: 'DB failure', code: 'PGRST001' } }])
    await expect(getArtistsByUserId(db, 'user-id')).rejects.toThrow('DB failure')
  })
})

describe('resolvePortalArtist', () => {
  it('returns artist when explicit artistId matches membership', async () => {
    // Call 1: artist_members with eq('artist_id') → found
    // Call 2: artists → artist row
    const db = makeSequentialDb([
      { data: { artist_id: 'artist-uuid' }, error: null },
      { data: mockArtistRow, error: null },
    ])
    const result = await resolvePortalArtist(db, 'auth-user-uuid', 'artist-uuid')
    expect(result?.id).toBe('artist-uuid')
  })

  it('throws FORBIDDEN when artistId does not match any membership', async () => {
    // Call 1: artist_members with eq('artist_id') → not found
    const db = makeSequentialDb([{ data: null, error: null }])
    await expect(resolvePortalArtist(db, 'auth-user-uuid', 'wrong-artist-uuid')).rejects.toThrow('FORBIDDEN')
  })

  it('falls back to first membership when no artistId provided', async () => {
    // Delegates to getArtistByUserId — Call 1: artist_members, Call 2: artists
    const db = makeSequentialDb([
      { data: { artist_id: 'artist-uuid' }, error: null },
      { data: mockArtistRow, error: null },
    ])
    const result = await resolvePortalArtist(db, 'auth-user-uuid')
    expect(result?.id).toBe('artist-uuid')
  })

  it('returns null when user has no memberships and no artistId', async () => {
    // Delegates to getArtistByUserId — no membership
    const db = makeSequentialDb([{ data: null, error: null }])
    const result = await resolvePortalArtist(db, 'no-artist-user')
    expect(result).toBeNull()
  })

  it('returns null when artist row was deleted', async () => {
    const db = makeSequentialDb([
      { data: { artist_id: 'artist-uuid' }, error: null },
      { data: null, error: { message: 'not found', code: 'PGRST116' } },
    ])
    const result = await resolvePortalArtist(db, 'auth-user-uuid', 'artist-uuid')
    expect(result).toBeNull()
  })
})

describe('isProfileComplete', () => {
  const baseArtist = rowToArtist({ ...mockArtistRow, image_url: 'https://example.com/photo.jpg' })
  const baseProfile: ArtistProfile = {
    id: 'profile-uuid',
    artistId: 'artist-uuid',
    bioShort: 'Short bio',
    bioMedium: undefined,
    bioLong: undefined,
    pressQuote: undefined,
    bookingContact: undefined,
    pressContact: undefined,
    riderStagePlotUrl: undefined,
    riderTechnicalUrl: undefined,
    riderHospitalityUrl: undefined,
    onboardingCompleted: false,
    epkTheme: 'default',
    epkLayout: 'classic',
    epkOrientation: 'portrait',
    epkBgImageUrl: undefined,
    epkBgOpacity: 20,
    epkSectionsOrder: [],
    epkSectionsHidden: [],
    epkPasswordHash: undefined,
    epkPasswordSections: [],
    epkGalleryPhotos: [],
    epkCustomThemeTokens: {},
    customLinks: [],
    epkDocument: undefined,
    epkDocumentVersion: 1,
    epkEditorMode: 'legacy',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }

  it('returns false when profile or artist is null', () => {
    expect(isProfileComplete(null, baseArtist)).toBe(false)
    expect(isProfileComplete(baseProfile, null)).toBe(false)
  })

  it('returns true when photo, bio, and facebook link are present', () => {
    const artist = rowToArtist({
      ...mockArtistRow,
      image_url: 'https://example.com/photo.jpg',
      facebook_url: 'https://facebook.com/artist',
    })
    expect(isProfileComplete(baseProfile, artist)).toBe(true)
  })

  it('returns false when no social or streaming link is set', () => {
    expect(isProfileComplete(baseProfile, baseArtist)).toBe(false)
  })
})
