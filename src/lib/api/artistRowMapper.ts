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

type ArtistRow = Database['public']['Tables']['artists']['Row']

export function rowToArtist(row: ArtistRow): Artist {
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
    email: row.email ?? undefined,
    vatNumber: row.vat_number ?? undefined,
    isEuNonGerman: row.is_eu_non_german,
    notes: row.notes ? stripEmojis(row.notes) : undefined,
    spotifyId: row.spotify_id ?? undefined,
    discogsId: row.discogs_id ?? undefined,
    songkickId: row.songkick_id ?? undefined,
    bandsintownId: row.bandsintown_id ?? undefined,
    bandsintownApiKey: row.bandsintown_api_key ?? undefined,
    lastfmName: row.lastfm_name ?? undefined,
    soundchartsId: row.soundcharts_id ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    isVisible: row.is_visible,
    landingPublishTrusted: row.landing_publish_trusted ?? false,
    logoUrl: row.logo_url ?? undefined,
    platformLinks: row.platform_links ?? undefined,
    storageQuotaBytes: row.storage_quota_bytes ?? null,
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
