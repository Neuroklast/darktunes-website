/**
 * Image optimisation utilities for darkTunes.
 *
 * All images delivered to the public website are routed through wsrv.nl,
 * an open-source image proxy that handles resizing, format conversion and
 * caching. Source images are stored in Cloudflare R2; only R2 URLs are
 * passed to this utility.
 *
 * @see https://wsrv.nl/docs/
 */

/**
 * Returns a wsrv.nl-optimised URL for the given source image.
 *
 * @param sourceUrl - The original image URL (e.g. a Cloudflare R2 public URL).
 * @param width     - Desired output width in pixels.
 * @returns A fully-formed wsrv.nl proxy URL that serves WebP output.
 *          Returns an empty string when `sourceUrl` is falsy.
 */
export function getOptimizedImageUrl(sourceUrl: string, width: number): string {
  if (!sourceUrl) return ''
  const encoded = encodeURIComponent(sourceUrl)
  return `https://wsrv.nl/?url=${encoded}&w=${width}&output=webp`
}

/**
 * Returns a wsrv.nl URL that crops the image to a square thumbnail.
 *
 * @param sourceUrl - The original image URL.
 * @param size      - Side length of the square in pixels (default 200).
 */
export function getSquareThumbnail(sourceUrl: string, size = 200): string {
  if (!sourceUrl) return ''
  const encoded = encodeURIComponent(sourceUrl)
  return `https://wsrv.nl/?url=${encoded}&w=${size}&h=${size}&fit=cover&output=webp`
}
