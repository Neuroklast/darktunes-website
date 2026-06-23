/**
 * app/api/portal/profile/route.ts
 *
 * PUT /api/portal/profile — upsert the artist's EPK profile.
 *
 * Security:
 *   - Bearer token verified via Supabase Auth
 *   - artist_id in body validated against the authenticated user's linked artist
 *   - Supabase RLS provides a second layer of enforcement at the DB level
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { withErrorHandler, buildApiError } from '@/lib/errors'
import {
  createBearerAuthSupabaseClient,
  createServerSupabaseClient,
} from '@/lib/supabase/server'
import { resolvePortalArtist, upsertArtistProfile } from '@/lib/api/artistProfiles'
import { sendSubmissionNotificationEmail } from '@/lib/email/sendSubmissionNotificationEmail'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { scryptSync, randomBytes } from 'crypto'
import type { Database } from '@/types/database'

type ArtistUpdate = Database['public']['Tables']['artists']['Update']
type NullableUrl = string | null | undefined

/** Hash a plaintext password using scrypt. Returns `salt:hash` hex string. */
function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const profileBodySchema = z.object({
  artist_id: z.string().uuid(),
  bio: z.string().max(2000).nullable().optional(),
  bio_short: z.string().max(6000).nullable().optional(),
  bio_medium: z.string().max(12000).nullable().optional(),
  bio_long: z.string().max(30000).nullable().optional(),
  bio_short_en: z.string().max(6000).nullable().optional(),
  bio_medium_en: z.string().max(12000).nullable().optional(),
  bio_long_en: z.string().max(30000).nullable().optional(),
  image_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  genres: z.array(z.string()).optional(),
  // Social/streaming URLs — stored in the artists table (single source of truth).
  // Accepted here so the form submits a single payload; written to artists only.
  website_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  instagram_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  youtube_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  bandcamp_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  spotify_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  apple_music_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  tiktok_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  facebook_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  press_quote: z.string().max(1000).nullable().optional(),
  press_quote_en: z.string().max(1000).nullable().optional(),
  submit_bio_for_review: z.boolean().optional(),
  founding_year: z.number().int().min(1900).max(2100).nullable().optional(),
  hometown: z.string().max(200).nullable().optional(),
  booking_contact: z.string().max(500).nullable().optional(),
  press_contact: z.string().max(500).nullable().optional(),
  soundcloud_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  custom_links: z.array(
    z.object({
      label: z.string(),
      url: z.union([z.string().url(), z.literal(''), z.null()]),
    }),
  ).nullable().optional(),
  rider_stage_plot_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  rider_technical_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  rider_hospitality_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  // EPK customisation
  epk_theme: z.string().max(50).optional(),
  epk_layout: z.enum(['classic', 'magazine', 'minimal', 'full-bleed']).optional(),
  epk_orientation: z.enum(['portrait', 'landscape']).optional(),
  epk_bg_image_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  epk_bg_opacity: z.number().int().min(0).max(100).optional(),
  epk_sections_order: z.array(z.string()).optional(),
  epk_sections_hidden: z.array(z.string()).optional(),
  // EPK password protection — client sends plaintext prefixed with __plain__
  epk_password_raw: z.string().max(200).nullable().optional(),
  epk_password_sections: z.array(z.string()).optional(),
  // EPK gallery + custom theme
  epk_gallery_photos: z.array(z.union([z.string().url(), z.literal(''), z.null()])).optional(),
  epk_custom_theme_tokens: z.record(z.string(), z.string()).nullable().optional(),
})

const normalizeUrl = (v: NullableUrl): string | null => (v === '' ? null : v ?? null)

export const PUT = withErrorHandler(async (req: NextRequest) => {
  // 1. Authenticate
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) throw buildApiError('AUTH_TOKEN_MISSING', 401)

  // Validate the Bearer token, then use a JWT-authenticated client so RLS
  // policies see auth.uid() correctly (cookie session may be absent/stale).
  const authClient = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token)

  if (authError || !user) throw buildApiError('AUTH_TOKEN_INVALID', 401)

  const supabase = await createBearerAuthSupabaseClient(token)

  // 2. Validate body
  const body: unknown = await req.json()
  const parsed = profileBodySchema.safeParse(body)
  if (!parsed.success) {
    throw buildApiError('VALIDATION_ERROR', 400)
  }

  // 3. Confirm the artist_id in the body belongs to the authenticated user
  let artist
  try {
    artist = await resolvePortalArtist(supabase, user.id, parsed.data.artist_id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('FORBIDDEN')) throw buildApiError('FORBIDDEN', 403)
    throw err
  }
  if (!artist) throw buildApiError('FORBIDDEN', 403)

  // 4. Build upsert payload — resolve password before inserting.
  // Social/streaming URLs (website_url, instagram_url, etc.) are stored in
  // the artists table only (Track 2 consolidation); exclude them here.
  const d = parsed.data
  const {
    website_url,
    instagram_url,
    youtube_url,
    bandcamp_url,
    spotify_url,
    apple_music_url,
    tiktok_url,
    facebook_url,
    soundcloud_url,
    image_url,
    rider_stage_plot_url,
    rider_technical_url,
    rider_hospitality_url,
    epk_bg_image_url,
    custom_links,
    epk_gallery_photos,
    // bio, genres, founding_year, and hometown are stored on artists (single source of truth);
    // extract them here so they are NOT passed to upsertArtistProfile.
    bio: _bio,
    genres,
    founding_year,
    hometown,
    bio_short,
    bio_medium,
    bio_long,
    bio_short_en,
    bio_medium_en,
    bio_long_en,
    press_quote,
    press_quote_en,
    submit_bio_for_review,
    ...profileFields
  } = d

  const hasBioEdits =
    bio_short !== undefined ||
    bio_medium !== undefined ||
    bio_long !== undefined ||
    bio_short_en !== undefined ||
    bio_medium_en !== undefined ||
    bio_long_en !== undefined ||
    press_quote !== undefined ||
    press_quote_en !== undefined

  const bioDraftPatch = hasBioEdits
    ? {
        ...(bio_short !== undefined ? { draft_bio_short: bio_short } : {}),
        ...(bio_medium !== undefined ? { draft_bio_medium: bio_medium } : {}),
        ...(bio_long !== undefined ? { draft_bio_long: bio_long } : {}),
        ...(bio_short_en !== undefined ? { draft_bio_short_en: bio_short_en } : {}),
        ...(bio_medium_en !== undefined ? { draft_bio_medium_en: bio_medium_en } : {}),
        ...(bio_long_en !== undefined ? { draft_bio_long_en: bio_long_en } : {}),
        ...(press_quote !== undefined ? { draft_press_quote: press_quote } : {}),
        ...(press_quote_en !== undefined ? { draft_press_quote_en: press_quote_en } : {}),
        ...(submit_bio_for_review !== false
          ? {
              bio_status: 'pending_review' as const,
              bio_submitted_at: new Date().toISOString(),
            }
          : {}),
      }
    : {}

  let epkPasswordHash: string | null | undefined = undefined
  if (profileFields.epk_password_raw !== undefined) {
    // null means "clear the password", a string means "set new password"
    epkPasswordHash = profileFields.epk_password_raw ? hashPassword(profileFields.epk_password_raw) : null
  }

  const normalizedCustomLinks = custom_links == null
    ? custom_links
    : custom_links
      .map((link) => ({ ...link, url: normalizeUrl(link.url) }))
      .filter((link): link is { label: string; url: string } => link.url !== null)

  const normalizedGalleryPhotos = epk_gallery_photos
    ?.map((url) => normalizeUrl(url))
    .filter((url): url is string => url !== null)

  const profileData = {
    ...profileFields,
    ...bioDraftPatch,
    ...(rider_stage_plot_url !== undefined ? { rider_stage_plot_url: normalizeUrl(rider_stage_plot_url) } : {}),
    ...(rider_technical_url !== undefined ? { rider_technical_url: normalizeUrl(rider_technical_url) } : {}),
    ...(rider_hospitality_url !== undefined ? { rider_hospitality_url: normalizeUrl(rider_hospitality_url) } : {}),
    ...(epk_bg_image_url !== undefined ? { epk_bg_image_url: normalizeUrl(epk_bg_image_url) } : {}),
    ...(custom_links !== undefined ? { custom_links: normalizedCustomLinks } : {}),
    ...(epk_gallery_photos !== undefined ? { epk_gallery_photos: normalizedGalleryPhotos } : {}),
    // Remove the raw password field; replace with hashed version
    epk_password_raw: undefined,
    ...(epkPasswordHash !== undefined ? { epk_password_hash: epkPasswordHash } : {}),
  }

  const profile = await upsertArtistProfile(supabase, profileData)

  if (hasBioEdits && submit_bio_for_review !== false) {
    try {
      const serviceRole = await createServiceRoleSupabaseClient()
      const { data: recipientProfiles } = await serviceRole
        .from('users')
        .select('id')
        .in('role', ['admin', 'editor'])

      const recipients = (recipientProfiles ?? []).map((recipient) => ({
        recipient_id: recipient.id,
        type: 'artist_bio_submission',
        entity_type: 'artist_epk',
        entity_id: artist.id,
        entity_name: artist.name,
        sender_id: user.id,
        read: false,
      }))

      if (recipients.length > 0) {
        await serviceRole.from('editor_notifications').insert(recipients)
      }

      const resendApiKey = process.env.RESEND_API_KEY ?? ''
      const resendFromEmail = process.env.RESEND_FROM_EMAIL ?? ''
      const labelNotificationEmail = process.env.LABEL_NOTIFICATION_EMAIL ?? ''
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://darktunes.com').replace(/\/$/, '')
      void sendSubmissionNotificationEmail(
        {
          type: 'release',
          title: `Bio update: ${artist.name}`,
          artistName: artist.name,
          submittedAt: new Date().toISOString(),
          adminUrl: `${siteUrl}/admin/press`,
        },
        { resendApiKey, resendFromEmail, labelNotificationEmail, fetch },
      ).catch((err: unknown) => console.error('[portal/profile] bio notification email failed:', err))
    } catch (notifyErr) {
      console.error('[portal/profile] bio submission notification failed:', notifyErr)
    }
  }

  // 5. Sync shared fields back to the artists table (single source of truth)
  const artistUpdate: ArtistUpdate = { updated_at: new Date().toISOString() }
  // artists.bio is synced only after admin approval — do not write bio from portal saves
  if (genres !== undefined) artistUpdate.genres = genres
  if (founding_year !== undefined) artistUpdate.founding_year = founding_year
  if (hometown !== undefined) artistUpdate.hometown = hometown
  if (website_url !== undefined) artistUpdate.website_url = normalizeUrl(website_url)
  if (instagram_url !== undefined) artistUpdate.instagram_url = normalizeUrl(instagram_url)
  if (youtube_url !== undefined) artistUpdate.youtube_url = normalizeUrl(youtube_url)
  if (bandcamp_url !== undefined) artistUpdate.bandcamp_url = normalizeUrl(bandcamp_url)
  if (spotify_url !== undefined) artistUpdate.spotify_url = normalizeUrl(spotify_url)
  if (apple_music_url !== undefined) artistUpdate.apple_music_url = normalizeUrl(apple_music_url)
  if (tiktok_url !== undefined) artistUpdate.tiktok_url = normalizeUrl(tiktok_url)
  if (facebook_url !== undefined) artistUpdate.facebook_url = normalizeUrl(facebook_url)
  if (soundcloud_url !== undefined) artistUpdate.soundcloud_url = normalizeUrl(soundcloud_url)
  if (image_url !== undefined) artistUpdate.image_url = normalizeUrl(image_url)

  const { error: artistUpdateError } = await supabase
    .from('artists')
    .update(artistUpdate)
    .eq('id', artist.id)

  if (artistUpdateError) {
    throw buildApiError('FORBIDDEN', 403)
  }

  // 6. Invalidate public-facing artist pages so changes are reflected immediately
  if (artist.slug) {
    revalidatePath(`/artists/${artist.slug}`)
    revalidatePath(`/press/artists/${artist.slug}`)
  }
  revalidatePath('/artists')
  revalidatePath('/press')

  return NextResponse.json({ profile })
})
