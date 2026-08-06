/**
 * src/lib/api/publicArtistEpk.ts
 *
 * Public-safe reads of artist EPK data for press pages and share links.
 * Selects only non-sensitive columns (never returns epk_password_hash).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ArtistProfile } from './artistProfiles'
import type { EpkDocumentV2, EpkEditorMode } from '@/lib/epk/schema/documentV2'
import { parseEpkDocumentV2 } from '@/lib/epk/schema/documentV2'

type DbClient = SupabaseClient<Database>

/** Never include epk_password_hash or other private columns. */
export const PUBLIC_EPK_COLUMNS =
  'bio_short,bio_medium,bio_long,press_quote,booking_contact,press_contact,rider_stage_plot_url,rider_technical_url,rider_hospitality_url,epk_document,epk_document_version,epk_editor_mode,epk_gallery_photos,custom_links' as const

type PublicEpkRow = Pick<
  Database['public']['Tables']['artist_epks']['Row'],
  | 'bio_short'
  | 'bio_medium'
  | 'bio_long'
  | 'press_quote'
  | 'booking_contact'
  | 'press_contact'
  | 'rider_stage_plot_url'
  | 'rider_technical_url'
  | 'rider_hospitality_url'
  | 'epk_document'
  | 'epk_document_version'
  | 'epk_editor_mode'
  | 'epk_gallery_photos'
  | 'custom_links'
>

export interface PublicArtistEpk {
  profile: Pick<
    ArtistProfile,
    | 'bioShort'
    | 'bioMedium'
    | 'bioLong'
    | 'pressQuote'
    | 'bookingContact'
    | 'pressContact'
    | 'riderStagePlotUrl'
    | 'riderTechnicalUrl'
    | 'riderHospitalityUrl'
    | 'epkGalleryPhotos'
    | 'customLinks'
    | 'epkDocumentVersion'
    | 'epkEditorMode'
  >
  document: EpkDocumentV2 | null
}

function rowToPublicArtistEpk(row: PublicEpkRow): PublicArtistEpk {
  const editorMode = (row.epk_editor_mode as EpkEditorMode | null) ?? 'legacy'
  let document: EpkDocumentV2 | null = null

  if (row.epk_document && editorMode === 'canvas') {
    try {
      document = parseEpkDocumentV2(row.epk_document)
    } catch {
      document = null
    }
  }

  return {
    profile: {
      bioShort: row.bio_short ?? undefined,
      bioMedium: row.bio_medium ?? undefined,
      bioLong: row.bio_long ?? undefined,
      pressQuote: row.press_quote ?? undefined,
      bookingContact: row.booking_contact ?? undefined,
      pressContact: row.press_contact ?? undefined,
      riderStagePlotUrl: row.rider_stage_plot_url ?? undefined,
      riderTechnicalUrl: row.rider_technical_url ?? undefined,
      riderHospitalityUrl: row.rider_hospitality_url ?? undefined,
      epkGalleryPhotos: row.epk_gallery_photos ?? [],
      customLinks: row.custom_links ?? [],
      epkDocumentVersion: row.epk_document_version ?? 1,
      epkEditorMode: editorMode,
    },
    document,
  }
}

export async function getPublicArtistEpkByArtistId(
  db: DbClient,
  artistId: string,
): Promise<PublicArtistEpk | null> {
  const { data, error } = await db
    .from('artist_epks')
    .select(PUBLIC_EPK_COLUMNS)
    .eq('artist_id', artistId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return rowToPublicArtistEpk(data as PublicEpkRow)
}