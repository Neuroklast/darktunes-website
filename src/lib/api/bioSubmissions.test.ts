import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  listPendingBioSubmissions,
  approveBioSubmission,
  rejectBioSubmission,
  resolveCanonicalArtistBio,
} from './bioSubmissions'
import type { ArtistProfile } from './artistProfiles'

type DbClient = SupabaseClient<Database>
type ArtistProfileRow = Database['public']['Tables']['artist_epks']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeSequentialDb(calls: Array<{ data: unknown; error: unknown }>): DbClient {
  let callIndex = 0
  return {
    from: vi.fn().mockImplementation(() => {
      const call = calls[callIndex] ?? { data: null, error: null }
      callIndex++
      return makeBuilder(call.data, call.error)
    }),
  } as unknown as DbClient
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const baseProfileRow: ArtistProfileRow = {
  id: 'profile-uuid',
  artist_id: 'artist-uuid',
  bio_short: 'Published short',
  bio_medium: null,
  bio_long: '<p>Published long</p>',
  bio_short_en: null,
  bio_medium_en: null,
  bio_long_en: null,
  press_quote: null,
  press_quote_en: null,
  draft_bio_short: 'Draft short',
  draft_bio_medium: null,
  draft_bio_long: '<p>Draft long</p>',
  draft_bio_short_en: 'Draft EN',
  draft_bio_medium_en: null,
  draft_bio_long_en: null,
  draft_press_quote: 'Draft quote',
  draft_press_quote_en: null,
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
  bio_status: 'pending_review',
  bio_embargo_until: null,
  bio_reviewed_by: null,
  bio_reviewed_at: null,
  bio_submitted_at: '2026-06-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('resolveCanonicalArtistBio', () => {
  it('strips HTML from long bio and prefers long over medium/short', () => {
    const profile = {
      bioLong: '<p>Long <strong>bio</strong></p>',
      bioMedium: 'Medium',
      bioShort: 'Short',
    } as ArtistProfile
    expect(resolveCanonicalArtistBio(profile)).toBe('Long bio')
  })

  it('falls back to medium then short', () => {
    expect(resolveCanonicalArtistBio({ bioMedium: 'Medium only' } as ArtistProfile)).toBe('Medium only')
    expect(resolveCanonicalArtistBio({ bioShort: 'Short only' } as ArtistProfile)).toBe('Short only')
  })
})

describe('listPendingBioSubmissions', () => {
  it('maps pending rows with artist join data', async () => {
    const db = makeMockDb([
      {
        ...baseProfileRow,
        artists: { name: 'C Z A R I N A', slug: 'czarina' },
      },
    ])
    const result = await listPendingBioSubmissions(db)
    expect(result).toHaveLength(1)
    expect(result[0].artistName).toBe('C Z A R I N A')
    expect(result[0].artistSlug).toBe('czarina')
    expect(result[0].bioStatus).toBe('pending_review')
    expect(result[0].profile.draftBioShort).toBe('Draft short')
  })

  it('throws on DB error', async () => {
    const db = makeMockDb(null, { message: 'Query failed' })
    await expect(listPendingBioSubmissions(db)).rejects.toThrow('Query failed')
  })
})

describe('approveBioSubmission', () => {
  it('promotes draft bios to published and syncs artists.bio', async () => {
    const approvedRow: ArtistProfileRow = {
      ...baseProfileRow,
      bio_short: 'Draft short',
      bio_long: '<p>Draft long</p>',
      bio_short_en: 'Draft EN',
      press_quote: 'Draft quote',
      bio_status: 'approved',
      bio_reviewed_by: 'admin-uuid',
      bio_reviewed_at: '2026-06-02T00:00:00Z',
    }
    const versionRows = [
      {
        id: 'version-1',
        artist_id: 'artist-uuid',
        locale: 'de',
        tier: 'short',
        content_html: 'Draft short',
        press_quote: 'Draft quote',
        status: 'approved',
        changed_by: null,
        reviewed_by: 'admin-uuid',
        created_at: '2026-06-02T00:00:00Z',
      },
    ]
    const db = makeSequentialDb([
      { data: baseProfileRow, error: null },
      { data: approvedRow, error: null },
      { data: null, error: null },
      { data: versionRows, error: null },
    ])
    const result = await approveBioSubmission(db, {
      artistId: 'artist-uuid',
      reviewerId: 'admin-uuid',
    })
    expect(result.bioStatus).toBe('approved')
    expect(result.bioShort).toBe('Draft short')
    expect(db.from).toHaveBeenCalledTimes(4)
  })

  it('throws when profile not found', async () => {
    const db = makeSequentialDb([{ data: null, error: { message: 'Not found', code: 'PGRST116' } }])
    await expect(
      approveBioSubmission(db, { artistId: 'missing', reviewerId: 'admin-uuid' }),
    ).rejects.toThrow('Artist EPK not found')
  })
})

describe('rejectBioSubmission', () => {
  it('sets bio_status back to draft', async () => {
    const rejectedRow: ArtistProfileRow = {
      ...baseProfileRow,
      bio_status: 'draft',
      bio_reviewed_by: 'admin-uuid',
      bio_reviewed_at: '2026-06-02T00:00:00Z',
    }
    const db = makeMockDb(rejectedRow)
    const result = await rejectBioSubmission(db, 'artist-uuid', 'admin-uuid')
    expect(result.bioStatus).toBe('draft')
  })
})