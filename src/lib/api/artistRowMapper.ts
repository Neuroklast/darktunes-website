/**
 * src/lib/api/artistRowMapper.ts
 *
 * Shared mapper: converts a raw `artists` DB row to the Artist domain type.
 * Extracted into its own module so both `artists.ts` and `artistProfiles.ts`
 * can share it without circular imports.
 */

import type { Database } from '@/types/database'
import type { Artist } from '@/types'
import { toSlug } from '@/lib/slugify'
import { stripEmojis } from '@/lib/stripEmojis'
import type { ArtistPrivateRow } from './artistPrivateData'

type ArtistRow = Database['public']['Tables']['artists']['Row']

/**
 * @param privateRow — preferred source for secrets/PII after artist_private_data migration.
 * Falls back to artists.* columns for DBs that have not applied reset.sql yet.
 */
export function rowToArtist(row: ArtistRow, privateRow?: ArtistPrivateRow | null): Artist {
  const email = privateRow?.email ?? row.email
  const vatNumber = privateRow?.vat_number ?? row.vat_number
  const notes = privateRow?.notes ?? row.notes
  const bandsintownApiKey = privateRow?.bandsintown_api_key ?? row.bandsintown_api_key
  const storageQuotaBytes =
    privateRow?.storage_quota_bytes !== undefined && privateRow !== null
      ? privateRow.storage_quota_bytes
      : row.storage_quota_bytes
  const isEuNonGerman = privateRow?.is_eu_non_german ?? row.is_eu_non_german

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
    email: email ?? undefined,
    vatNumber: vatNumber ?? undefined,
    isEuNonGerman,
    notes: notes ? stripEmojis(notes) : undefined,
    spotifyId: row.spotify_id ?? undefined,
    discogsId: row.discogs_id ?? undefined,
    songkickId: row.songkick_id ?? undefined,
    bandsintownId: row.bandsintown_id ?? undefined,
    bandsintownApiKey: bandsintownApiKey ?? undefined,
    lastfmName: row.lastfm_name ?? undefined,
    soundchartsId: row.soundcharts_id ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    isVisible: row.is_visible,
    landingPublishTrusted: row.landing_publish_trusted ?? false,
    logoUrl: row.logo_url ?? undefined,
    platformLinks: row.platform_links ?? undefined,
    storageQuotaBytes: storageQuotaBytes ?? null,
    smartLinks: (row.smart_links ?? []) as Array<{ label: string; url: string }>,
    userId: row.user_id ?? null,
    imagePositionX: row.image_position_x ?? null,
    imagePositionY: row.image_position_y ?? null,
    imageScale: row.image_scale ?? null,
    portalTermsVersion: row.portal_terms_version ?? null,
    portalTermsAcceptedAt: row.portal_terms_accepted_at ?? null,
    portalTermsAcceptedBy: row.portal_terms_accepted_by ?? null,
  }
}
