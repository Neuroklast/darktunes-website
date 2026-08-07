/**
 * src/lib/sync/discogsApi.ts
 *
 * Discogs API integration.
 *
 * - `fetchDiscogsArtistProfile`: fetches bio, images and URLs for an artist.
 * - `fetchDiscogsArtistReleases`: fetches physical releases (Vinyl/CD) for
 *   a given Discogs artist ID, including catalog numbers and barcodes for
 *   deduplication.
 *
 * Authentication: Personal Access Token (header-based).
 * Docs: https://www.discogs.com/developers/
 */

import { getBrandUserAgent } from '@/lib/brand/userAgent'
import { HttpError } from '@/lib/rateLimiter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Enrichment data returned from GET /artists/{id} */
export interface DiscogsArtistProfile {
  discogsId: string
  name: string
  /** Plain-text biography (Discogs markup stripped) */
  bio: string | null
  /** URL of the primary (or first available) artist image */
  imageUrl: string | null
  /** External URLs listed on the Discogs artist page */
  urls: string[]
}

export interface DiscogsArtistRelease {
  id: number
  title: string
  artist: string
  year: number | null
  format: string
  label: string | null
  catno: string | null
  resource_url: string
  thumb: string
  role: string
  type: string
}

export interface DiscogsReleaseFull {
  id: number
  title: string
  artists: Array<{ name: string }>
  year: number | null
  formats?: Array<{ name: string; descriptions?: string[] }>
  images?: Array<{ uri: string; width: number; height: number; type: string }>
  labels?: Array<{ name: string; catno: string }>
  identifiers?: Array<{ type: string; value: string }>
}

export interface DiscogsRelease {
  discogsId: string
  title: string
  artistName: string
  releaseDate: string | null
  coverUrl: string | null
  catalogNumber: string | null
  barcode: string | null
  format: 'vinyl' | 'cd' | 'digital' | 'other'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches artist profile data from the Discogs API.
 *
 * Returns bio, primary image URL, and any external URLs listed on the artist
 * page.  No API token is required for basic reads but providing one increases
 * the rate limit.
 *
 * @param discogsArtistId - Numeric Discogs artist ID (e.g. "123456")
 * @param token           - Optional Discogs personal access token
 * @param fetchFn         - Injectable fetch (real in prod, mocked in tests)
 */
export async function fetchDiscogsArtistProfile(
  discogsArtistId: string,
  token: string | undefined,
  fetchFn: typeof fetch,
): Promise<DiscogsArtistProfile> {
  const headers: Record<string, string> = {
    'User-Agent': getBrandUserAgent(),
  }
  if (token) headers['Authorization'] = `Discogs token=${token}`

  const response = await fetchFn(`https://api.discogs.com/artists/${discogsArtistId}`, { headers })

  if (!response.ok) {
    throw new HttpError(response.status, `Discogs artist profile fetch failed: ${response.status}`)
  }

  const data = (await response.json()) as {
    id: number
    name: string
    profile?: string
    images?: Array<{ uri: string; type: string; width: number; height: number }>
    urls?: string[]
  }

  // Prefer the primary image; fall back to the first available image
  const primaryImage =
    data.images?.find((img) => img.type === 'primary') ?? data.images?.[0] ?? null

  return {
    discogsId: String(data.id),
    name: data.name,
    bio: data.profile ? cleanDiscogsMarkup(data.profile) : null,
    imageUrl: primaryImage?.uri ?? null,
    urls: data.urls ?? [],
  }
}

/**
 * Fetches all releases for a given Discogs artist ID.
 * Returns simplified release objects with catalog numbers and barcodes.
 */
export async function fetchDiscogsArtistReleases(
  discogsArtistId: string,
  token: string,
  fetchFn: typeof fetch,
): Promise<DiscogsRelease[]> {
  const releases: DiscogsRelease[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const url = new URL(`https://api.discogs.com/artists/${discogsArtistId}/releases`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(perPage))
    url.searchParams.set('sort', 'year')
    url.searchParams.set('sort_order', 'desc')

    const response = await fetchFn(url.toString(), {
      headers: {
        Authorization: `Discogs token=${token}`,
        'User-Agent': getBrandUserAgent(),
      },
    })

    if (!response.ok) {
      throw new HttpError(response.status, `Discogs releases fetch failed: ${response.status}`)
    }

    const data = (await response.json()) as {
      releases: DiscogsArtistRelease[]
      pagination: { pages: number; page: number }
    }

    for (const r of data.releases) {
      // Only include main releases (not appearances, tracks, etc.)
      if (r.type !== 'master' && r.type !== 'release') continue

      releases.push({
        discogsId: String(r.id),
        title: r.title,
        artistName: r.artist,
        releaseDate: r.year ? `${r.year}-01-01` : null,
        coverUrl: r.thumb || null,
        catalogNumber: r.catno || null,
        barcode: null, // barcode is in the full release object; skipped for perf
        format: deriveFormat(r.format),
      })
    }

    if (page >= data.pagination.pages) break
    page++
  }

  return releases
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveFormat(format: string | undefined | null): DiscogsRelease['format'] {
  if (!format) return 'other'
  const f = format.toLowerCase()
  if (f.includes('vinyl') || f.includes('lp') || f.includes('ep')) return 'vinyl'
  if (f.includes('cd') || f.includes('cdr')) return 'cd'
  if (f.includes('digital') || f.includes('file')) return 'digital'
  return 'other'
}

/**
 * Strips Discogs wiki markup from a profile text, leaving readable plain text.
 *
 * Handled tags:
 *   [a=Name]       → "Name"  (artist link)
 *   [l=Name]       → "Name"  (label link)
 *   [r=Title]      → "Title" (release link)
 *   [m=Title]      → "Title" (master link)
 *   [url=…]text[/url] → "text"
 *   bare [a123]    → removed (numeric-only artist reference)
 */
export function cleanDiscogsMarkup(text: string): string {
  return text
    .replace(/\[a\d*=([^\]]*)\]/g, '$1')
    .replace(/\[l\d*=([^\]]*)\]/g, '$1')
    .replace(/\[r\d*=([^\]]*)\]/g, '$1')
    .replace(/\[m\d*=([^\]]*)\]/g, '$1')
    .replace(/\[url=[^\]]*\]([^[]*)\[\/url\]/gi, '$1')
    .replace(/\[a\d+\]/g, '')
    .trim()
}
