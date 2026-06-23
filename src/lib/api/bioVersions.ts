/**
 * src/lib/api/bioVersions.ts — immutable bio snapshots on admin approve.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  resolvePublishedBioLong,
  resolvePublishedBioMedium,
  resolvePublishedBioShort,
  resolvePublishedPressQuote,
  type ArtistProfile,
  type PressLocale,
} from './artistProfiles'

type DbClient = SupabaseClient<Database>
type BioVersionRow = Database['public']['Tables']['artist_bio_versions']['Row']
type BioVersionInsert = Database['public']['Tables']['artist_bio_versions']['Insert']

export type BioVersionTier = 'short' | 'medium' | 'long'

export interface BioVersion {
  id: string
  artistId: string
  locale: PressLocale
  tier: BioVersionTier
  contentHtml: string
  pressQuote: string | undefined
  status: string
  changedBy: string | undefined
  reviewedBy: string | undefined
  createdAt: string
}

function rowToBioVersion(row: BioVersionRow): BioVersion {
  return {
    id: row.id,
    artistId: row.artist_id,
    locale: row.locale,
    tier: row.tier,
    contentHtml: row.content_html,
    pressQuote: row.press_quote ?? undefined,
    status: row.status,
    changedBy: row.changed_by ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    createdAt: row.created_at,
  }
}

function resolvePublishedBioByTier(
  profile: ArtistProfile,
  locale: PressLocale,
  tier: BioVersionTier,
): string | undefined {
  if (tier === 'short') return resolvePublishedBioShort(profile, locale)
  if (tier === 'medium') return resolvePublishedBioMedium(profile, locale)
  return resolvePublishedBioLong(profile, locale)
}

export interface SnapshotBioVersionsInput {
  profile: ArtistProfile
  reviewedBy: string
  changedBy?: string
}

/** Inserts one row per non-empty published bio tier/locale after approval. */
export async function snapshotBioVersionsOnApprove(
  db: DbClient,
  input: SnapshotBioVersionsInput,
): Promise<BioVersion[]> {
  const tiers: BioVersionTier[] = ['short', 'medium', 'long']
  const locales: PressLocale[] = ['de', 'en']
  const rows: BioVersionInsert[] = []

  for (const locale of locales) {
    for (const tier of tiers) {
      const content = resolvePublishedBioByTier(input.profile, locale, tier)
      if (!content?.trim()) continue
      rows.push({
        artist_id: input.profile.artistId,
        locale,
        tier,
        content_html: content,
        press_quote: tier === 'short' ? resolvePublishedPressQuote(input.profile, locale) ?? null : null,
        status: input.profile.bioStatus,
        changed_by: input.changedBy ?? null,
        reviewed_by: input.reviewedBy,
      })
    }
  }

  if (rows.length === 0) return []

  const { data, error } = await db.from('artist_bio_versions').insert(rows).select()
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToBioVersion(row as BioVersionRow))
}

export async function listBioVersionsByArtistId(
  db: DbClient,
  artistId: string,
  limit = 50,
): Promise<BioVersion[]> {
  const { data, error } = await db
    .from('artist_bio_versions')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToBioVersion(row as BioVersionRow))
}