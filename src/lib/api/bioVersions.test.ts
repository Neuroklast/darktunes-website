import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { snapshotBioVersionsOnApprove, listBioVersionsByArtistId } from './bioVersions'
import type { ArtistProfile } from './artistProfiles'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const baseProfile: ArtistProfile = {
  id: 'profile-1',
  artistId: 'artist-1',
  bioShort: '<p>DE short</p>',
  bioMedium: '<p>DE medium</p>',
  bioLong: undefined,
  pressQuote: 'Great band',
  bioShortEn: '<p>EN short</p>',
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
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('snapshotBioVersionsOnApprove', () => {
  it('inserts one row per non-empty locale/tier combination', async () => {
    const inserted = [
      {
        id: 'v1',
        artist_id: 'artist-1',
        locale: 'de',
        tier: 'short',
        content_html: '<p>DE short</p>',
        press_quote: 'Great band',
        status: 'approved',
        changed_by: null,
        reviewed_by: 'admin-1',
        created_at: '2026-06-01T00:00:00Z',
      },
    ]
    const db = makeMockDb(inserted)
    const result = await snapshotBioVersionsOnApprove(db, {
      profile: baseProfile,
      reviewedBy: 'admin-1',
    })
    expect(result).toHaveLength(1)
    expect(result[0].tier).toBe('short')
    expect(result[0].pressQuote).toBe('Great band')
  })

  it('returns empty array when no published bios exist', async () => {
    const emptyProfile: ArtistProfile = {
      ...baseProfile,
      bioShort: undefined,
      bioMedium: undefined,
      bioLong: undefined,
      bioShortEn: undefined,
    }
    const db = makeMockDb([])
    const result = await snapshotBioVersionsOnApprove(db, {
      profile: emptyProfile,
      reviewedBy: 'admin-1',
    })
    expect(result).toEqual([])
  })
})

describe('listBioVersionsByArtistId', () => {
  it('returns mapped versions newest first', async () => {
    const db = makeMockDb([
      {
        id: 'v1',
        artist_id: 'artist-1',
        locale: 'de',
        tier: 'long',
        content_html: '<p>Long</p>',
        press_quote: null,
        status: 'approved',
        changed_by: null,
        reviewed_by: 'admin-1',
        created_at: '2026-06-02T00:00:00Z',
      },
    ])
    const result = await listBioVersionsByArtistId(db, 'artist-1')
    expect(result[0].contentHtml).toBe('<p>Long</p>')
  })
})