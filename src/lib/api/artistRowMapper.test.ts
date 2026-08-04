/**
 * Tests for rowToArtist — ensures the slug fallback algorithm is consistent
 * with the `toSlug` helper used in the admin artist form so links never 404.
 */
import { describe, it, expect } from 'vitest'
import { rowToArtist } from './artistRowMapper'
import type { Database } from '@/types/database'

type ArtistRow = Database['public']['Tables']['artists']['Row']

const BASE_ROW: ArtistRow = {
  id: 'id-1',
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
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

/**
 * Mirror of the `toSlug` function in ArtistForm.tsx.
 * Both must produce the same output for the same name — if they diverge,
 * links saved in the admin form will 404 when navigated to.
 */
function toSlugFromForm(name: string): string {
  return name
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'ae')
    .replace(/Ö/g, 'oe')
    .replace(/Ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

describe('rowToArtist — slug handling', () => {
  it('uses the stored DB slug when present', () => {
    const artist = rowToArtist({ ...BASE_ROW, slug: 'custom-slug' })
    expect(artist.slug).toBe('custom-slug')
  })

  it('generates a fallback slug from name when DB slug is null', () => {
    const artist = rowToArtist({ ...BASE_ROW, slug: null as unknown as string, name: 'My Band' })
    expect(artist.slug).toBe('my-band')
  })

  it('generates a fallback slug from name when DB slug is empty string', () => {
    const artist = rowToArtist({ ...BASE_ROW, slug: '', name: 'My Band' })
    expect(artist.slug).toBe('my-band')
  })

  it('generates a fallback slug from name when DB slug is whitespace only', () => {
    const artist = rowToArtist({ ...BASE_ROW, slug: '   ', name: 'My Band' })
    expect(artist.slug).toBe('my-band')
  })

  it('fallback slug matches admin form toSlug for plain ASCII names', () => {
    const names = ['Darkwave Artists', 'Test Band 123', 'Another One']
    for (const name of names) {
      const fromMapper = rowToArtist({ ...BASE_ROW, slug: '', name }).slug
      const fromForm = toSlugFromForm(name)
      expect(fromMapper).toBe(fromForm)
    }
  })

  it('fallback slug matches admin form toSlug for names with umlauts (ä ö ü Ä Ö Ü ß)', () => {
    const names = ['Björk', 'Mötley Crüe', 'Über Band', 'Straße Records']
    for (const name of names) {
      const fromMapper = rowToArtist({ ...BASE_ROW, slug: '', name }).slug
      const fromForm = toSlugFromForm(name)
      expect(fromMapper).toBe(fromForm)
    }
  })

  it('fallback slug matches admin form toSlug for names with special chars', () => {
    const names = ['AC/DC', 'Guns N\' Roses', 'The Artist (Live)', 'Band & Friends']
    for (const name of names) {
      const fromMapper = rowToArtist({ ...BASE_ROW, slug: '', name }).slug
      const fromForm = toSlugFromForm(name)
      expect(fromMapper).toBe(fromForm)
    }
  })
})
