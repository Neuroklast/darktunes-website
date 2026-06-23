/**
 * src/lib/api/portalProfile.ts
 *
 * Networking helpers for the Artist Portal profile page.
 * Keeps XHR/fetch calls out of the UI component (SRP).
 */

import type { ApiErrorResponse } from '@/lib/errors'
import type { Database } from '@/types/database'

/** Thrown when /api/portal/profile returns a non-2xx response. */
export class PortalProfileSaveError extends Error {
  constructor(public readonly body: ApiErrorResponse) {
    super(body.error)
    this.name = 'PortalProfileSaveError'
  }
}

/**
 * Payload for saving an artist profile via /api/portal/profile.
 * Derived from the DB Insert type to prevent type drift (TS-2).
 * Only the fields that the portal form surfaces are included.
 */
export type ArtistProfilePayload = Pick<
  Database['public']['Tables']['artist_epks']['Insert'],
  | 'artist_id'
  | 'booking_contact'
  | 'press_contact'
  | 'rider_stage_plot_url'
  | 'rider_technical_url'
  | 'rider_hospitality_url'
  | 'epk_theme'
  | 'epk_layout'
  | 'epk_orientation'
  | 'epk_bg_image_url'
  | 'epk_bg_opacity'
  | 'epk_sections_order'
  | 'epk_sections_hidden'
  | 'epk_password_sections'
  | 'epk_gallery_photos'
> & {
  // artist_id is required (not optional like in Insert)
  artist_id: string
  // Raw plaintext password (server will hash it). Null = clear, undefined = unchanged.
  epk_password_raw?: string | null
  epk_custom_theme_tokens?: Record<string, string> | null
  // bio, genres, founding_year, hometown, and image_url are stored in the artists table (single source of truth).
  // Included here so the route can write them to artists in a single request.
  bio?: string | null
  genres?: string[]
  founding_year?: number | null
  hometown?: string | null
  image_url?: string | null
  // Social/streaming URLs — stored in the artists table (single source of truth).
  // Included here so the route can write them to artists in a single request.
  website_url?: string | null
  instagram_url?: string | null
  youtube_url?: string | null
  bandcamp_url?: string | null
  spotify_url?: string | null
  apple_music_url?: string | null
  tiktok_url?: string | null
  facebook_url?: string | null
  soundcloud_url?: string | null
  custom_links?: Array<{ label: string; url: string }> | null
  /** Route maps these form keys to draft_* columns and sets bio_status pending_review. */
  bio_short?: string | null
  bio_medium?: string | null
  bio_long?: string | null
  bio_short_en?: string | null
  bio_medium_en?: string | null
  bio_long_en?: string | null
  press_quote?: string | null
  press_quote_en?: string | null
  submit_bio_for_review?: boolean
}

export type RiderType = 'stage_plot' | 'technical' | 'hospitality'

/**
 * Upload a rider PDF via the /api/portal/upload-rider Route Handler.
 * Returns the public CDN URL of the uploaded document.
 */
export async function uploadRiderDocument(
  file: File,
  riderType: RiderType,
  token: string,
): Promise<string> {
  const body = new FormData()
  body.append('file', file)

  const res = await fetch(`/api/portal/upload-rider?type=${encodeURIComponent(riderType)}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body,
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}) ) as { error?: string }
    throw new Error(errBody.error ?? 'Upload failed')
  }

  const data = (await res.json()) as { url?: string }
  if (!data.url) throw new Error('No URL in response')
  return data.url
}

/**
 * Upload an artist photo via the /api/portal/upload-photo Route Handler.
 * Uses XHR so that upload progress can be reported via `onProgress`.
 *
 * @param artistId   The artist UUID.
 * @param file       The image file to upload.
 * @param token      The user's access token (Bearer).
 * @param onProgress Called with 0–100 as the upload progresses.
 * @returns          The public URL of the uploaded photo.
 */
export function uploadArtistPhoto(
  artistId: string,
  file: File,
  token: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const body = new FormData()
    body.append('file', file)
    body.append('artistId', artistId)

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { url?: string }
          if (data.url) {
            onProgress(100)
            resolve(data.url)
          } else {
            reject(new Error('No URL in response'))
          }
        } catch {
          reject(new Error('Invalid server response'))
        }
      } else {
        try {
          const errBody = JSON.parse(xhr.responseText) as { error?: string }
          reject(new Error(errBody.error ?? 'Upload failed'))
        } catch {
          reject(new Error('Upload failed'))
        }
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.open('POST', '/api/portal/upload-photo')
    xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    xhr.send(body)
  })
}

/**
 * Persist the artist profile via the /api/portal/profile Route Handler.
 *
 * @param payload  The profile data to save.
 * @param token    The user's access token (Bearer).
 * @throws         If the server returns a non-2xx status.
 */
export async function saveArtistProfile(
  payload: ArtistProfilePayload,
  token: string,
): Promise<void> {
  const res = await fetch('/api/portal/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Save failed', status: res.status })) as ApiErrorResponse
    throw new PortalProfileSaveError({
      error: errBody.error ?? 'Save failed',
      code: errBody.code,
      status: errBody.status ?? res.status,
    })
  }
}
