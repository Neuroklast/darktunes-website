/**
 * src/lib/api/bioSubmissions.ts
 *
 * Admin DAL for artist bio approval workflow (draft → published).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { stripHtmlToPlainText } from '@/lib/press/bioText'
import { snapshotBioVersionsOnApprove } from './bioVersions'
import { getArtistProfileByArtistId, rowToArtistProfile } from './artistProfiles'
import type { ArtistProfile, BioStatus } from './artistProfiles'

type DbClient = SupabaseClient<Database>
type ArtistProfileRow = Database['public']['Tables']['artist_epks']['Row']
type PendingBioRow = ArtistProfileRow & { artists: { name: string; slug: string } | null }

export interface BioSubmissionSummary {
  artistId: string
  artistName: string
  artistSlug: string
  bioStatus: BioStatus
  bioSubmittedAt: string | undefined
  profile: ArtistProfile
}

/** Canonical artists.bio text synced from approved long/medium bio (DE). */
export function resolveCanonicalArtistBio(profile: ArtistProfile): string {
  const source = profile.bioLong ?? profile.bioMedium ?? profile.bioShort ?? ''
  return stripHtmlToPlainText(source)
}

export async function listPendingBioSubmissions(db: DbClient): Promise<BioSubmissionSummary[]> {
  const { data, error } = await db
    .from('artist_epks')
    .select('*, artists(name, slug)')
    .eq('bio_status', 'pending_review')
    .order('bio_submitted_at', { ascending: false })

  if (error) throw new Error(error.message)

  return ((data ?? []) as PendingBioRow[]).map((row) => {
    const artistJoin = row.artists
    const profile = rowToArtistProfile(row)
    return {
      artistId: profile.artistId,
      artistName: artistJoin?.name ?? 'Unknown artist',
      artistSlug: artistJoin?.slug ?? '',
      bioStatus: profile.bioStatus,
      bioSubmittedAt: profile.bioSubmittedAt,
      profile,
    }
  })
}

export interface ApproveBioSubmissionInput {
  artistId: string
  reviewerId: string
  embargoUntil?: string | null
}

export async function approveBioSubmission(
  db: DbClient,
  input: ApproveBioSubmissionInput,
): Promise<ArtistProfile> {
  const existing = await getArtistProfileByArtistId(db, input.artistId)
  if (!existing) throw new Error('Artist EPK not found')

  const now = new Date().toISOString()
  const update: Database['public']['Tables']['artist_epks']['Update'] = {
    bio_short: existing.draftBioShort ?? existing.bioShort ?? null,
    bio_medium: existing.draftBioMedium ?? existing.bioMedium ?? null,
    bio_long: existing.draftBioLong ?? existing.bioLong ?? null,
    press_quote: existing.draftPressQuote ?? existing.pressQuote ?? null,
    bio_short_en: existing.draftBioShortEn ?? existing.bioShortEn ?? null,
    bio_medium_en: existing.draftBioMediumEn ?? existing.bioMediumEn ?? null,
    bio_long_en: existing.draftBioLongEn ?? existing.bioLongEn ?? null,
    press_quote_en: existing.draftPressQuoteEn ?? existing.pressQuoteEn ?? null,
    bio_status: 'approved',
    bio_reviewed_by: input.reviewerId,
    bio_reviewed_at: now,
    bio_embargo_until: input.embargoUntil ?? null,
  }

  const { data, error } = await db
    .from('artist_epks')
    .update(update)
    .eq('artist_id', input.artistId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from approveBioSubmission')

  const approved = rowToArtistProfile(data as ArtistProfileRow)
  const canonicalBio = resolveCanonicalArtistBio(approved)

  const { error: artistError } = await db
    .from('artists')
    .update({ bio: canonicalBio || null, updated_at: now })
    .eq('id', input.artistId)

  if (artistError) throw new Error(artistError.message)

  await snapshotBioVersionsOnApprove(db, {
    profile: approved,
    reviewedBy: input.reviewerId,
    changedBy: existing.bioSubmittedAt ? undefined : input.reviewerId,
  })

  return approved
}

export async function rejectBioSubmission(
  db: DbClient,
  artistId: string,
  reviewerId: string,
): Promise<ArtistProfile> {
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('artist_epks')
    .update({
      bio_status: 'draft',
      bio_reviewed_by: reviewerId,
      bio_reviewed_at: now,
    })
    .eq('artist_id', artistId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from rejectBioSubmission')

  return rowToArtistProfile(data as ArtistProfileRow)
}