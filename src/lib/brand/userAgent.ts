/**
 * HTTP User-Agent strings for outbound server fetches.
 * Prefer env (BRAND_USER_AGENT / BRAND_COVER_ART_USER_AGENT / NOMINATIM_USER_AGENT).
 * Fallbacks are brand-neutral so multi-tenant deploys do not leak a hard-coded label name;
 * set production env to partner-registered UAs when APIs require an allowlisted identity.
 */

const DEFAULT_UA = 'LabelSite/1.0'

/** General label bots (Discogs, etc.). */
export function getBrandUserAgent(): string {
  return process.env.BRAND_USER_AGENT?.trim() || DEFAULT_UA
}

/** Cover-art validation fetch. */
export function getCoverArtCheckUserAgent(): string {
  return process.env.BRAND_COVER_ART_USER_AGENT?.trim() || 'LabelSite-cover-art-check/1.0'
}

/** Nominatim / OpenStreetMap (requires identifying UA). */
export function getNominatimUserAgent(): string {
  return (
    process.env.NOMINATIM_USER_AGENT?.trim() ||
    process.env.BRAND_USER_AGENT?.trim() ||
    'LabelSite-tour-planner/1.0'
  )
}
