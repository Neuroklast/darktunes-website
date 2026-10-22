/**
 * src/lib/api/artistProfiles.ts
 *
 * Data Access Layer for the `artist_epks` table.
 *
 * artist_epks stores the artist-managed EPK (Electronic Press Kit) data.
 * Each row is linked 1-to-1 with an artist. RLS ensures only the owning
 * Supabase Auth user can read/update their own profile row.
 *
 * Every function receives a SupabaseClient<Database> as its first argument
 * (Inversion of Control) — never imports the global singleton.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Artist } from '@/types'
import { rowToArtist } from './artistRowMapper'
import { parseCustomLinks } from '@/lib/types/jsonColumns'

type DbClient = SupabaseClient<Database>
type ArtistProfileRow = Database['public']['Tables']['artist_epks']['Row']
type ArtistProfileInsert = Database['public']['Tables']['artist_epks']['Insert']
type ArtistRow = Database['public']['Tables']['artists']['Row']

// ---------------------------------------------------------------------------
// Domain type
// ---------------------------------------------------------------------------

export interface ArtistProfile {
  id: string
  artistId: string
  bioShort: string | undefined
  bioMedium: string | undefined
  bioLong: string | undefined
  pressQuote: string | undefined
  bookingContact: string | undefined
  pressContact: string | undefined
  riderStagePlotUrl: string | undefined
  riderTechnicalUrl: string | undefined
  riderHospitalityUrl: string | undefined
  onboardingCompleted: boolean
  // EPK customisation
  epkTheme: string
  epkLayout: 'classic' | 'magazine' | 'minimal' | 'full-bleed'
  epkOrientation: 'portrait' | 'landscape'
  epkBgImageUrl: string | undefined
  epkBgOpacity: number
  epkSectionsOrder: string[]
  epkSectionsHidden: string[]
  epkPasswordHash: string | undefined
  epkPasswordSections: string[]
  epkGalleryPhotos: string[]
  epkCustomThemeTokens: Record<string, string>
  customLinks: Array<{ label: string; url: string }>
  epkDocument: Record<string, unknown> | undefined
  epkDocumentVersion: number
  epkEditorMode: 'legacy' | 'canvas'
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function rowToArtistProfile(row: ArtistProfileRow): ArtistProfile {
  return {
    id: row.id,
    artistId: row.artist_id,
    bioShort: row.bio_short ?? undefined,
    bioMedium: row.bio_medium ?? undefined,
    bioLong: row.bio_long ?? undefined,
    pressQuote: row.press_quote ?? undefined,
    bookingContact: row.booking_contact ?? undefined,
    pressContact: row.press_contact ?? undefined,
    riderStagePlotUrl: row.rider_stage_plot_url ?? undefined,
    riderTechnicalUrl: row.rider_technical_url ?? undefined,
    riderHospitalityUrl: row.rider_hospitality_url ?? undefined,
    onboardingCompleted: row.onboarding_completed ?? false,
    epkTheme: row.epk_theme ?? 'default',
    epkLayout: (row.epk_layout as ArtistProfile['epkLayout'] | null) ?? 'classic',
    epkOrientation: (row.epk_orientation as ArtistProfile['epkOrientation'] | null) ?? 'portrait',
    epkBgImageUrl: row.epk_bg_image_url ?? undefined,
    epkBgOpacity: row.epk_bg_opacity ?? 20,
    epkSectionsOrder: row.epk_sections_order ?? [],
    epkSectionsHidden: row.epk_sections_hidden ?? [],
    epkPasswordHash: row.epk_password_hash ?? undefined,
    epkPasswordSections: row.epk_password_sections ?? [],
    epkGalleryPhotos: row.epk_gallery_photos ?? [],
    epkCustomThemeTokens: (row.epk_custom_theme_tokens as Record<string, string> | null) ?? {},
    customLinks: parseCustomLinks(row.custom_links),
    epkDocument: row.epk_document ?? undefined,
    epkDocumentVersion: row.epk_document_version ?? 1,
    epkEditorMode: (row.epk_editor_mode as ArtistProfile['epkEditorMode'] | null) ?? 'legacy',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Returns true when the artist has completed the minimum required profile fields:
 * a photo (image_url on artists table), at least one bio, and at least one social/streaming link.
 * Social links live on the `Artist` record; pass the artist as the optional
 * second argument to include them in the completeness check.
 * Used to decide whether to show the onboarding wizard.
 */
function hasAnySocialOrStreamingLink(artist: Artist): boolean {
  return Boolean(
    artist.soundcloudUrl ||
      artist.spotifyUrl ||
      artist.instagramUrl ||
      artist.websiteUrl ||
      artist.youtubeUrl ||
      artist.appleMusicUrl ||
      artist.facebookUrl ||
      artist.tiktokUrl ||
      artist.bandcampUrl ||
      artist.twitterUrl,
  )
}

function hasBioContent(profile: ArtistProfile | null, artist: Artist): boolean {
  if (profile?.bioShort || profile?.bioMedium || profile?.bioLong) return true
  const labelBio = artist.bio?.replace(/<[^>]*>/g, '').trim()
  return Boolean(labelBio)
}

export function isProfileComplete(profile: ArtistProfile | null, artist?: Artist | null): boolean {
  if (!artist) return false
  const hasPhoto = Boolean(artist.imageUrl)
  return hasPhoto && hasBioContent(profile, artist) && hasAnySocialOrStreamingLink(artist)
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetches the EPK profile for a given artist ID.
 * Returns `null` if no profile row exists yet (PGRST116).
 */
export async function getArtistProfileByArtistId(
  db: DbClient,
  artistId: string,
): Promise<ArtistProfile | null> {
  const { data, error } = await db
    .from('artist_epks')
    .select('*')
    .eq('artist_id', artistId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data ? rowToArtistProfile(data as ArtistProfileRow) : null
}

/**
 * Upserts (insert or update) the EPK profile for an artist.
 * Uses ON CONFLICT (artist_id) DO UPDATE so callers never need to know
 * whether the row already exists.
 */
export async function upsertArtistProfile(
  db: DbClient,
  profileData: ArtistProfileInsert,
): Promise<ArtistProfile> {
  const { data, error } = await db
    .from('artist_epks')
    .upsert(profileData, { onConflict: 'artist_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from upsertArtistProfile')

  return rowToArtistProfile(data as ArtistProfileRow)
}

/**
 * Looks up ALL artist records linked to a Supabase Auth user via artist_members.
 * Returns an empty array if the user has no memberships.
 *
 * Use this instead of getArtistByUserId when supporting multi-artist contexts.
 */
export async function getArtistsByUserId(db: DbClient, userId: string): Promise<Artist[]> {
  // Step 1: get all artist IDs the user belongs to
  const { data: memberships, error: memberErr } = await db
    .from('artist_members')
    .select('artist_id')
    .eq('user_id', userId)

  if (memberErr) throw new Error(memberErr.message)
  if (!memberships || memberships.length === 0) return []

  const artistIds = memberships.map((m) => m.artist_id)

  // Step 2: load all artist rows in one query
  const { data, error } = await db.from('artists').select('*').in('id', artistIds)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToArtist(row as ArtistRow))
}

/**
 * Looks up the artist record linked to a Supabase Auth user ID.
 * Returns the first artist found via artist_members, or `null` if none.
 *
 * @deprecated Prefer getArtistsByUserId() which supports multi-artist memberships.
 * Kept as a shim so existing single-artist portal routes continue to work
 * without changes during the migration period.
 */
export async function getArtistByUserId(db: DbClient, userId: string): Promise<Artist | null> {
  // Look up via artist_members (respects the new many-to-many model)
  const { data: membership, error: memberErr } = await db
    .from('artist_members')
    .select('artist_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (memberErr) throw new Error(memberErr.message)
  if (!membership) return null

  const { data, error } = await db
    .from('artists')
    .select('*')
    .eq('id', membership.artist_id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data ? rowToArtist(data as ArtistRow) : null
}

export interface ArtistOption {
  id: string
  name: string
  slug: string
}

/** Lightweight artist list for the assistant context selector. */
export async function listArtistOptions(db: DbClient): Promise<ArtistOption[]> {
  const { data, error } = await db
    .from('artists')
    .select('id, name, slug')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug ?? '' }))
}

/** Lightweight artist search (admin/editor with manage capability). */
export async function searchArtistOptions(
  db: DbClient,
  query: string,
  limit = 20,
): Promise<ArtistOption[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const { data, error } = await db
    .from('artists')
    .select('id, name, slug')
    .ilike('name', `%${trimmed}%`)
    .order('name', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50))
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug ?? '' }))
}

export async function getArtistOptionById(
  db: DbClient,
  artistId: string,
): Promise<ArtistOption | null> {
  const { data, error } = await db
    .from('artists')
    .select('id, name, slug')
    .eq('id', artistId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { id: data.id, name: data.name, slug: data.slug ?? '' } : null
}

/** All artist memberships for a user, without loading full artist rows. */
export async function listArtistMemberships(
  db: DbClient,
  userId: string,
): Promise<ArtistOption[]> {
  const { data: memberships, error: memberError } = await db
    .from('artist_members')
    .select('artist_id')
    .eq('user_id', userId)
  if (memberError) throw new Error(memberError.message)
  const ids = (memberships ?? []).map((row) => row.artist_id)
  if (ids.length === 0) return []
  const { data, error } = await db
    .from('artists')
    .select('id, name, slug')
    .in('id', ids)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, slug: row.slug ?? '' }))
}

/**
 * Resolves the active artist for a portal request.
 *
 * - If `artistId` is provided: validates the user is a member of that artist
 *   and returns it (throws 403 if not a member).
 * - If `artistId` is omitted and the user has exactly one membership: returns it.
 * - If `artistId` is omitted and the user has multiple memberships: returns the
 *   first artist (callers that want multi-artist selection should pass `artistId`).
 * - Returns `null` if the user has no artist memberships.
 *
 * Throws `Error` with an HTTP-hint message for security rejections so that
 * route handlers can map them to the appropriate ApiError.
 */
export async function resolvePortalArtist(
  db: DbClient,
  userId: string,
  artistId?: string | null,
): Promise<Artist | null> {
  if (artistId) {
    // Validate membership for the requested artistId
    const { data: membership, error: memberErr } = await db
      .from('artist_members')
      .select('artist_id')
      .eq('user_id', userId)
      .eq('artist_id', artistId)
      .maybeSingle()

    if (memberErr) throw new Error(memberErr.message)
    if (!membership) throw new Error('FORBIDDEN: not a member of this artist')

    const { data, error } = await db.from('artists').select('*').eq('id', artistId).single()
    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }
    return data ? rowToArtist(data as ArtistRow) : null
  }

  // No artistId specified — fall back to first membership
  return getArtistByUserId(db, userId)
}
