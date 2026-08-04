/**
 * Schema-sync smoke tests for the core domain interfaces.
 *
 * These tests have two purposes:
 *  1. Compile-time: TypeScript's `satisfies` operator ensures the object
 *     literally satisfies the interface — any missing required field causes a
 *     compile error, not just a test failure.
 *  2. Runtime: a handful of checks verify that TypeScript type inference works
 *     as expected at runtime so Vitest reports real results.
 */
import { describe, expect, it } from 'vitest'
import type { Artist, SiteSettings, NewsPost, Concert } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasId(obj: unknown): boolean {
  return typeof obj === 'object' && obj !== null && 'id' in obj && typeof (obj as Record<string, unknown>).id === 'string'
}

function isValidNewsStatus(status: string): boolean {
  return (['draft', 'published', 'scheduled', 'archived'] as const).includes(
    status as 'draft' | 'published' | 'scheduled' | 'archived',
  )
}

// ---------------------------------------------------------------------------
// Artist
// ---------------------------------------------------------------------------

describe('Artist interface', () => {
  const artist: Artist = {
    id: 'a1',
    name: 'Test Artist',
    slug: 'test-artist',
    bio: 'A bio',
    genres: ['Techno'],
    imageUrl: 'https://example.com/img.jpg',
    featured: false,
    isVisible: true,
  }

  it('can construct a valid Artist object (satisfies check)', () => {
    // The `satisfies` type-check below would cause a compile error if any
    // required field were missing.
    const _ = artist satisfies Artist
    expect(_ ).toBeDefined()
  })

  it('has required id field', () => {
    expect(hasId(artist)).toBe(true)
  })

  it('has required name field', () => {
    expect(typeof artist.name).toBe('string')
  })

  it('has required slug field', () => {
    expect(typeof artist.slug).toBe('string')
  })

  it('has required isVisible field', () => {
    expect(typeof artist.isVisible).toBe('boolean')
  })

  it('has required featured field', () => {
    expect(typeof artist.featured).toBe('boolean')
  })

  it('an object without id fails the hasId runtime check', () => {
    const noId = { name: 'No ID', slug: 'no-id' }
    expect(hasId(noId)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SiteSettings
// ---------------------------------------------------------------------------

describe('SiteSettings interface', () => {
  const minimal: SiteSettings = {
    labelName: 'darkTunes',
    labelShortName: 'DT',
    labelTagline: 'tagline',
    contactEmail: 'hello@example.com',
    privacyPolicyUrl: '',
    termsUrl: '',
    instagramUrl: '',
    youtubeUrl: '',
    spotifyUrl: '',
    spotifyPlaylistUri: '',
    spotifyPlaylists: [],
    heroBadge: '',
    heroNewsBadge: '',
    heroDescription: '',
    seoTitle: '',
    seoDescription: '',
    ogTitle: '',
    ogDescription: '',
    impressumCompanyName: '',
    impressumLegalForm: '',
    impressumRepresentative: '',
    impressumAddress: '',
    impressumVatId: '',
    impressumRegisterCourt: '',
    impressumRegisterNumber: '',
    impressumPhone: '',
    impressumEmail: '',
    datenschutzContent: '',
    agbContent: '',
    agbContentEn: '',
    portalTermsVersion: '2026-08-01',
    labelBillingStreet: '',
    labelBillingPostalCode: '',
    labelBillingCity: '',
    labelBillingCountry: '',
    consentPlaceholderUrl: '',
    noiseOpacity: 0.04,
    crtScanlinesEnabled: false,
    vignetteIntensity: 0.5,
    shopifyStoreUrl: '',
    youtubeChannelId: '',
    videosPerPage: 9,
    videosLinkToPage: false,
    excludeShortsFromPublic: false,
    concertsPerPage: 8,
    concertsLinkToPage: false,
    carouselAutoplayMs: 0,
    featureToggles: { promoPool: true, editorTools: true },
    inviteLinkExpiryHours: 168,
  }

  it('can construct a valid SiteSettings object', () => {
    const _ = minimal satisfies SiteSettings
    expect(_.labelName).toBe('darkTunes')
  })
})

// ---------------------------------------------------------------------------
// NewsPost.status
// ---------------------------------------------------------------------------

describe('NewsPost.status', () => {
  const statuses = ['draft', 'published', 'scheduled', 'archived'] as const

  statuses.forEach((s) => {
    it(`accepts status '${s}'`, () => {
      expect(isValidNewsStatus(s)).toBe(true)
    })
  })

  it('rejects unknown status', () => {
    expect(isValidNewsStatus('unknown')).toBe(false)
  })

  it('can construct NewsPost with published status', () => {
    const post: NewsPost = {
      id: 'p1',
      title: 'Title',
      excerpt: 'Excerpt',
      content: '<p>Content</p>',
      publishedAt: '2026-01-01T00:00:00Z',
      slug: 'title',
      featured: false,
      isPressOnly: false,
      status: 'published',
    }
    expect(post.status).toBe('published')
  })
})

// ---------------------------------------------------------------------------
// Concert
// ---------------------------------------------------------------------------

describe('Concert interface', () => {
  const concert: Concert = {
    id: 'c1',
    artistId: 'a1',
    artistName: 'Test Artist',
    eventName: 'Big Show',
    venueName: 'Venue',
    venueAddress: null,
    venueCity: 'Berlin',
    venueCountry: 'DE',
    concertDate: '2026-06-01',
    ticketUrl: null,
    songkickId: null,
    bandsintownId: null,
    status: 'confirmed',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    eventTime: null,
    eventType: 'gig',
    trailerUrl: null,
    venueLat: null,
    venueLng: null,
    venueOsmId: null,
    newsPostId: null,
  }

  it('can construct a valid Concert object', () => {
    expect(concert.id).toBe('c1')
  })

  it('has required id field', () => {
    expect(hasId(concert)).toBe(true)
  })

  it('has artistId field (nullable)', () => {
    expect('artistId' in concert).toBe(true)
  })

  it('has eventName field', () => {
    expect(typeof concert.eventName).toBe('string')
  })

  it('has concertDate field', () => {
    expect(typeof concert.concertDate).toBe('string')
  })

  it('has status field', () => {
    expect(typeof concert.status).toBe('string')
  })

  it('has createdAt field', () => {
    expect(typeof concert.createdAt).toBe('string')
  })

  it('has updatedAt field', () => {
    expect(typeof concert.updatedAt).toBe('string')
  })

  it('has eventType field', () => {
    expect(typeof concert.eventType).toBe('string')
  })
})
