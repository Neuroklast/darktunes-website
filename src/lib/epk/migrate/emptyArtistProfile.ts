/**
 * src/lib/epk/migrate/emptyArtistProfile.ts
 *
 * Minimal ArtistProfile stub for EPK migration when no artist_epks row exists yet.
 */

import type { ArtistProfile } from '@/lib/api/artistProfiles'

export function emptyArtistProfile(artistId: string): ArtistProfile {
  return {
    id: '',
    artistId,
    bioShort: undefined,
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
    createdAt: '',
    updatedAt: '',
  }
}