import { describe, it, expect } from 'vitest'
import { calcProfileCompletion, COMPLETION_FIELDS } from './profileCompletion'
import type { Artist } from '@/types'
import type { ArtistProfile } from '@/lib/api/artistProfiles'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseArtist: Artist = {
  id: 'a1',
  name: 'Test Artist',
  slug: 'test-artist',
  bio: '',
  genres: [],
  imageUrl: '',
  featured: false,
  isVisible: true,
}

const fullProfile: ArtistProfile = {
  id: 'p1',
  artistId: 'a1',
  bioShort: 'Short',
  bioMedium: undefined,
  bioLong: undefined,
  pressQuote: undefined,
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
  bookingContact: undefined,
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
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calcProfileCompletion', () => {
  it('returns 0 score with all fields missing when artist and profile are empty', () => {
    const result = calcProfileCompletion(baseArtist, null)
    expect(result.score).toBe(0)
    expect(result.missing).toHaveLength(COMPLETION_FIELDS.length)
  })

  it('returns 100 score when all fields are filled via artist and profile', () => {
    const artistWithCountry: Artist = {
      ...baseArtist,
      imageUrl: 'https://cdn.darktunes.com/photo.jpg',
      genres: ['electronic'],
      country: 'DE',
      spotifyUrl: 'https://open.spotify.com/artist/123',
      instagramUrl: 'https://instagram.com/artist',
      websiteUrl: 'https://artist.example.com',
    }
    const result = calcProfileCompletion(artistWithCountry, fullProfile)
    expect(result.score).toBe(100)
    expect(result.missing).toHaveLength(0)
  })

  it('returns partial score when only some fields are filled', () => {
    // Only photo via artist.imageUrl is filled
    const artistWithPhoto: Artist = {
      ...baseArtist,
      imageUrl: 'https://cdn.darktunes.com/photo.jpg',
    }
    const partialProfile: ArtistProfile = {
      ...fullProfile,
      bioShort: undefined,
    }
    const result = calcProfileCompletion(artistWithPhoto, partialProfile)
    // Only 'photo' field (weight 20) filled out of 100 total weight
    expect(result.score).toBe(20)
    expect(result.missing.map((f) => f.key)).toContain('bio')
    expect(result.missing.map((f) => f.key)).toContain('spotify')
  })

  it('uses artist fields as fallback when profile is null', () => {
    const artistWithData: Artist = {
      ...baseArtist,
      imageUrl: 'https://cdn.example.com/photo.jpg',
      bio: 'Artist bio',
      genres: ['metal'],
      spotifyUrl: 'https://open.spotify.com/artist/456',
      instagramUrl: 'https://instagram.com/artist',
      websiteUrl: 'https://artist.example.com',
      country: 'DE',
    }
    const result = calcProfileCompletion(artistWithData, null)
    expect(result.score).toBe(100)
    expect(result.missing).toHaveLength(0)
  })

  it('includes country field in missing when artist.country is undefined', () => {
    const result = calcProfileCompletion(baseArtist, fullProfile)
    const missingKeys = result.missing.map((f) => f.key)
    expect(missingKeys).toContain('country')
  })

  it('missing list contains CompletionField objects with correct shape', () => {
    const result = calcProfileCompletion(baseArtist, null)
    for (const field of result.missing) {
      expect(field).toHaveProperty('key')
      expect(field).toHaveProperty('labelKey')
      expect(field).toHaveProperty('weight')
      expect(typeof field.weight).toBe('number')
    }
  })
})
