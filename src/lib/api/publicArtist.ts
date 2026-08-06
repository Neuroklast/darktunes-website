/**
 * Public-safe artist reads — never selects or maps private columns.
 *
 * Private (admin/portal only): bandsintown_api_key, email, vat_number, notes,
 * user_id, storage_quota_bytes, portal_terms_*, landing_publish_trusted.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Artist } from '@/types'
import { toSlug } from '@/lib/slugify'
import { stripEmojis } from '@/lib/stripEmojis'
import { PUBLIC_QUERY_LIMITS } from './queryLimits'

type DbClient = SupabaseClient<Database>

/** Columns safe for anon / public RSC payloads. Keep in sync with toPublicArtist. */
export const PUBLIC_ARTIST_COLUMNS = [
  'id',
  'name',
  'slug',
  'bio',
  'genres',
  'image_url',
  'spotify_url',
  'apple_music_url',
  'instagram_url',
  'youtube_url',
  'website_url',
  'facebook_url',
  'twitter_url',
  'tiktok_url',
  'bandcamp_url',
  'shop_url',
  'soundcloud_url',
  'featured',
  'country',
  'founding_year',
  'hometown',
  'spotify_id',
  'discogs_id',
  'songkick_id',
  'bandsintown_id',
  'lastfm_name',
  'soundcharts_id',
  'is_visible',
  'logo_url',
  'platform_links',
  'smart_links',
  'image_position_x',
  'image_position_y',
  'image_scale',
].join(',')

/** Secrets / staff-only fields that must never appear on public select lists. */
export const PRIVATE_ARTIST_COLUMN_NAMES = [
  'bandsintown_api_key',
  'email',
  'vat_number',
  'notes',
  'user_id',
  'storage_quota_bytes',
  'landing_publish_trusted',
  'portal_terms_version',
  'portal_terms_accepted_at',
  'portal_terms_accepted_by',
  'is_eu_non_german',
  'last_synced_at',
] as const

export type PublicArtist = Omit<
  Artist,
  | 'email'
  | 'vatNumber'
  | 'notes'
  | 'bandsintownApiKey'
  | 'userId'
  | 'storageQuotaBytes'
  | 'landingPublishTrusted'
  | 'portalTermsVersion'
  | 'portalTermsAcceptedAt'
  | 'portalTermsAcceptedBy'
  | 'isEuNonGerman'
  | 'lastSyncedAt'
>

type PublicArtistRow = Pick<
  Database['public']['Tables']['artists']['Row'],
  | 'id'
  | 'name'
  | 'slug'
  | 'bio'
  | 'genres'
  | 'image_url'
  | 'spotify_url'
  | 'apple_music_url'
  | 'instagram_url'
  | 'youtube_url'
  | 'website_url'
  | 'facebook_url'
  | 'twitter_url'
  | 'tiktok_url'
  | 'bandcamp_url'
  | 'shop_url'
  | 'soundcloud_url'
  | 'featured'
  | 'country'
  | 'founding_year'
  | 'hometown'
  | 'spotify_id'
  | 'discogs_id'
  | 'songkick_id'
  | 'bandsintown_id'
  | 'lastfm_name'
  | 'soundcharts_id'
  | 'is_visible'
  | 'logo_url'
  | 'platform_links'
  | 'smart_links'
  | 'image_position_x'
  | 'image_position_y'
  | 'image_scale'
>

export function toPublicArtist(row: PublicArtistRow): PublicArtist {
  return {
    id: row.id,
    name: stripEmojis(row.name),
    slug: (row.slug ?? '').trim() || toSlug(row.name),
    bio: row.bio ? stripEmojis(row.bio) : '',
    genres: row.genres,
    imageUrl: row.image_url ?? '',
    spotifyUrl: row.spotify_url ?? undefined,
    appleMusicUrl: row.apple_music_url ?? undefined,
    instagramUrl: row.instagram_url ?? undefined,
    youtubeUrl: row.youtube_url ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    facebookUrl: row.facebook_url ?? undefined,
    twitterUrl: row.twitter_url ?? undefined,
    tiktokUrl: row.tiktok_url ?? undefined,
    bandcampUrl: row.bandcamp_url ?? undefined,
    shopUrl: row.shop_url ?? undefined,
    soundcloudUrl: row.soundcloud_url ?? undefined,
    featured: row.featured,
    country: row.country ? stripEmojis(row.country) : undefined,
    foundedYear: row.founding_year ?? undefined,
    hometown: row.hometown ? stripEmojis(row.hometown) : undefined,
    spotifyId: row.spotify_id ?? undefined,
    discogsId: row.discogs_id ?? undefined,
    songkickId: row.songkick_id ?? undefined,
    bandsintownId: row.bandsintown_id ?? undefined,
    lastfmName: row.lastfm_name ?? undefined,
    soundchartsId: row.soundcharts_id ?? undefined,
    isVisible: row.is_visible,
    logoUrl: row.logo_url ?? undefined,
    platformLinks: row.platform_links ?? undefined,
    smartLinks: (row.smart_links ?? []) as Array<{ label: string; url: string }>,
    imagePositionX: row.image_position_x ?? null,
    imagePositionY: row.image_position_y ?? null,
    imageScale: row.image_scale ?? null,
  }
}

/** Strip secrets from a full Artist (defense if a full row was loaded by mistake). */
export function artistToPublicArtist(artist: Artist): PublicArtist {
  return {
    id: artist.id,
    name: artist.name,
    slug: artist.slug,
    bio: artist.bio,
    genres: artist.genres,
    imageUrl: artist.imageUrl,
    logoUrl: artist.logoUrl,
    spotifyUrl: artist.spotifyUrl,
    appleMusicUrl: artist.appleMusicUrl,
    instagramUrl: artist.instagramUrl,
    youtubeUrl: artist.youtubeUrl,
    websiteUrl: artist.websiteUrl,
    facebookUrl: artist.facebookUrl,
    twitterUrl: artist.twitterUrl,
    tiktokUrl: artist.tiktokUrl,
    bandcampUrl: artist.bandcampUrl,
    shopUrl: artist.shopUrl,
    soundcloudUrl: artist.soundcloudUrl,
    featured: artist.featured,
    country: artist.country,
    foundedYear: artist.foundedYear,
    hometown: artist.hometown,
    spotifyId: artist.spotifyId,
    discogsId: artist.discogsId,
    songkickId: artist.songkickId,
    bandsintownId: artist.bandsintownId,
    lastfmName: artist.lastfmName,
    soundchartsId: artist.soundchartsId,
    isVisible: artist.isVisible,
    platformLinks: artist.platformLinks,
    smartLinks: artist.smartLinks,
    imagePositionX: artist.imagePositionX,
    imagePositionY: artist.imagePositionY,
    imageScale: artist.imageScale,
  }
}

export async function getPublicArtists(db: DbClient): Promise<PublicArtist[]> {
  const { data, error } = await db
    .from('artists')
    .select(PUBLIC_ARTIST_COLUMNS)
    .eq('is_visible', true)
    .order('featured', { ascending: false })
    .order('name', { ascending: true })
    .limit(PUBLIC_QUERY_LIMITS.artists)
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as PublicArtistRow[]).map(toPublicArtist)
}

/**
 * @param requireVisible — default true for public routes; set false for
 * trusted server preview paths (service role) when the artist may be hidden.
 */
export async function getPublicArtistBySlug(
  db: DbClient,
  slug: string,
  options: { requireVisible?: boolean } = {},
): Promise<PublicArtist | null> {
  const requireVisible = options.requireVisible !== false
  let query = db.from('artists').select(PUBLIC_ARTIST_COLUMNS).eq('slug', slug)
  if (requireVisible) query = query.eq('is_visible', true)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return toPublicArtist(data as unknown as PublicArtistRow)

  // Legacy rows with empty/null slug: resolve via name-derived slug (public columns only).
  let legacy = db.from('artists').select(PUBLIC_ARTIST_COLUMNS).or('slug.is.null,slug.eq.')
  if (requireVisible) legacy = legacy.eq('is_visible', true)
  const { data: nullSlugArtists, error: nullSlugError } = await legacy
  if (nullSlugError) throw new Error(nullSlugError.message)

  for (const row of (nullSlugArtists ?? []) as unknown as PublicArtistRow[]) {
    const mapped = toPublicArtist(row)
    if (mapped.slug === slug) return mapped
  }
  return null
}

export async function getPublicRelatedArtists(
  db: DbClient,
  currentArtistId: string,
  genres: string[],
  limit = 6,
): Promise<PublicArtist[]> {
  if (!genres.length) return []
  const { data, error } = await db
    .from('artists')
    .select(PUBLIC_ARTIST_COLUMNS)
    .eq('is_visible', true)
    .neq('id', currentArtistId)
    .filter('genres', 'ov', `{${genres.join(',')}}`)
    .limit(limit)
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as PublicArtistRow[]).map(toPublicArtist)
}
