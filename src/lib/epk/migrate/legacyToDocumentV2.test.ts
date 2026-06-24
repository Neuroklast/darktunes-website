import { describe, expect, it } from 'vitest'
import type { ArtistProfile } from '@/lib/api/artistProfiles'
import type { Artist } from '@/types'
import { legacyToDocumentV2 } from './legacyToDocumentV2'
import { parseEpkDocumentV2 } from '@/lib/epk/schema/documentV2'

const baseProfile: ArtistProfile = {
  id: 'profile-1',
  artistId: 'artist-1',
  bioShort: '<p>Short bio</p>',
  bioMedium: undefined,
  bioLong: undefined,
  pressQuote: 'A great band',
  bioShortEn: undefined,
  bioMediumEn: undefined,
  bioLongEn: undefined,
  pressQuoteEn: undefined,
  draftBioShort: undefined,
  draftBioMedium: undefined,
  draftBioLong: undefined,
  draftPressQuote: undefined,
  draftBioShortEn: undefined,
  draftBioMediumEn: undefined,
  draftBioLongEn: undefined,
  draftPressQuoteEn: undefined,
  bioStatus: 'approved',
  bioEmbargoUntil: undefined,
  bioReviewedBy: undefined,
  bioReviewedAt: undefined,
  bioSubmittedAt: undefined,
  bookingContact: 'booking@example.com',
  pressContact: undefined,
  riderStagePlotUrl: undefined,
  riderTechnicalUrl: undefined,
  riderHospitalityUrl: undefined,
  onboardingCompleted: true,
  epkTheme: 'default',
  epkLayout: 'classic',
  epkOrientation: 'portrait',
  epkBgImageUrl: undefined,
  epkBgOpacity: 20,
  epkSectionsOrder: ['header', 'quote', 'bio', 'info', 'contacts', 'links'],
  epkSectionsHidden: [],
  epkPasswordHash: undefined,
  epkPasswordSections: [],
  epkGalleryPhotos: [],
  epkCustomThemeTokens: {},
  customLinks: [],
  epkDocument: undefined,
  epkDocumentVersion: 1,
  epkEditorMode: 'legacy',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const baseArtist: Artist = {
  id: 'artist-1',
  name: 'Test Artist',
  slug: 'test-artist',
  bio: '',
  genres: ['Metal', 'Rock'],
  imageUrl: 'https://cdn.example.r2.dev/artists/photo.jpg',
  isVisible: true,
  featured: false,
  foundedYear: 2015,
  hometown: 'Berlin',
  websiteUrl: 'https://example.com',
  spotifyUrl: 'https://open.spotify.com/artist/1',
}

const layouts = ['classic', 'magazine', 'minimal', 'full-bleed'] as const
const orientations = ['portrait', 'landscape'] as const

describe('legacyToDocumentV2', () => {
  it.each(layouts)('migrates layout %s to valid document v2', (layout) => {
    const doc = legacyToDocumentV2({
      profile: { ...baseProfile, epkLayout: layout },
      artist: baseArtist,
      labelName: 'darkTunes',
    })
    const parsed = parseEpkDocumentV2(doc)
    expect(parsed.version).toBe(2)
    expect(parsed.pages).toHaveLength(1)
    expect(parsed.elements.length).toBeGreaterThan(5)
    expect(parsed.metadata.title).toContain('Test Artist')
  })

  it.each(orientations)('supports orientation %s', (orientation) => {
    const doc = legacyToDocumentV2({
      profile: { ...baseProfile, epkOrientation: orientation },
      artist: baseArtist,
    })
    expect(doc.orientation).toBe(orientation)
    if (orientation === 'landscape') {
      expect(doc.pages[0].width).toBeGreaterThan(doc.pages[0].height)
    } else {
      expect(doc.pages[0].height).toBeGreaterThan(doc.pages[0].width)
    }
  })

  it('includes biography text stripped of HTML', () => {
    const doc = legacyToDocumentV2({
      profile: baseProfile,
      artist: baseArtist,
    })
    const bio = doc.elements.find((el) => el.role === 'bio')
    expect(bio?.content).toContain('Short bio')
    expect(bio?.content).not.toContain('<p>')
  })

  it('hides sections listed in epk_sections_hidden', () => {
    const doc = legacyToDocumentV2({
      profile: { ...baseProfile, epkSectionsHidden: ['quote', 'bio'] },
      artist: baseArtist,
    })
    expect(doc.elements.some((el) => el.role === 'quote')).toBe(false)
    expect(doc.elements.some((el) => el.role === 'bio')).toBe(false)
  })
})