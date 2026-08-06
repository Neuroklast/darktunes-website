/**
 * src/lib/imageUtils.ts
 *
 * Central image proxy utilities for the darkTunes platform.
 *
 * All public-facing images (whether cached in R2 or externally hosted) MUST be
 * served through wsrv.nl, which performs on-the-fly WebP conversion, resizing,
 * and smart CDN caching — preventing origin load and ensuring consistent output.
 *
 * Usage:
 *   <img src={getOptimizedImageUrl(artist.imageUrl, 400)} />
 *   <img src={getSquareThumbnail(release.coverArt, 300)} />
 */

const WSRV_BASE = 'https://wsrv.nl/'

const WSRV_DEFAULTS = {
  output: 'webp',
  q: '75',
  n: '-1',
  maxage: '31d',
} as const

function buildWsrvUrl(url: string, params: Record<string, string | number>): string {
  const parts = [`url=${encodeURIComponent(url)}`]
  for (const [key, value] of Object.entries(WSRV_DEFAULTS)) {
    parts.push(`${key}=${value}`)
  }
  for (const [key, value] of Object.entries(params)) {
    parts.push(`${key}=${value}`)
  }
  return `${WSRV_BASE}?${parts.join('&')}`
}

/**
 * Returns a wsrv.nl-proxied URL that serves the image at `width` pixels wide,
 * converted to WebP format.
 *
 * @param url   - Original image URL (e.g. a Cloudflare R2 public URL)
 * @param width - Desired output width in pixels
 * @returns     - wsrv.nl proxy URL, or empty string if `url` is falsy
 */
export function getOptimizedImageUrl(url: string, width: number): string {
  if (!url) return ''
  return buildWsrvUrl(url, { w: width })
}

/**
 * Higher-quality wsrv proxy for brand logos / wordmarks (sharp edges, less WebP mush).
 * Prefer this over getOptimizedImageUrl for UI chrome logos.
 */
export function getOptimizedLogoUrl(url: string, width = 600): string {
  if (!url) return ''
  return buildWsrvUrl(url, { w: width, q: 90 })
}

/**
 * Returns a wsrv.nl-proxied URL that crops and resizes the image to a square
 * thumbnail of `size × size` pixels in WebP format.
 *
 * @param url  - Original image URL
 * @param size - Desired square dimension in pixels
 * @returns    - wsrv.nl proxy URL, or empty string if `url` is falsy
 */
export function getSquareThumbnail(url: string, size: number): string {
  if (!url) return ''
  return buildWsrvUrl(url, { w: size, h: size, fit: 'cover' })
}

/**
 * Rewrites every `<img src="...">` in an HTML string so that images are served
 * through wsrv.nl at a capped width (default: 800 px) in WebP format.
 *
 * Designed for use with rich-text content authored in TipTap or similar editors
 * (news posts, about page body) where images may be full-resolution originals.
 * Already-proxied wsrv.nl URLs are left untouched to avoid double-encoding.
 *
 * @param html  - Raw HTML string (should already be DOMPurify-sanitised)
 * @param width - Max output width in pixels (default: 800)
 * @returns     - HTML string with optimised image src attributes
 */
export function processHtmlImages(html: string, width = 800): string {
  if (!html) return html
  // Replace src attributes that are NOT already pointing at wsrv.nl
  return html.replace(
    /(<img\b[^>]*?\bsrc=")([^"]+)(")/gi,
    (match, before, src, after) => {
      if (src.startsWith('https://wsrv.nl') || src.startsWith('data:')) return match
      return `${before}${getOptimizedImageUrl(src, width)}${after}`
    },
  )
}