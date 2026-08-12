/**
 * Pure helpers for the regular artist profile (`/artists/[slug]`) video/news
 * preview: show N grid rows before an in-place "Show all" button.
 *
 * Column counts must stay aligned with ArtistDetailContent grid classes:
 * - Videos: default 1 / md 2 / xl 3
 * - News: default 1 / md 2
 */

export const ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT = 2
export const ARTIST_PROFILE_PREVIEW_ROWS_MIN = 1
export const ARTIST_PROFILE_PREVIEW_ROWS_MAX = 12

/** Tailwind md breakpoint used by artist profile grids. */
export const ARTIST_PROFILE_MD_MEDIA = '(min-width: 768px)'
/** Tailwind xl breakpoint used by the videos grid. */
export const ARTIST_PROFILE_XL_MEDIA = '(min-width: 1280px)'

export function clampArtistProfilePreviewRows(rows: number | undefined | null): number {
  if (rows == null || !Number.isFinite(rows)) return ARTIST_PROFILE_PREVIEW_ROWS_DEFAULT
  const n = Math.trunc(rows)
  if (n < ARTIST_PROFILE_PREVIEW_ROWS_MIN) return ARTIST_PROFILE_PREVIEW_ROWS_MIN
  if (n > ARTIST_PROFILE_PREVIEW_ROWS_MAX) return ARTIST_PROFILE_PREVIEW_ROWS_MAX
  return n
}

/** Visible tile count = rows × columns (both floored to at least 1). */
export function artistProfileVisibleCount(rows: number, columns: number): number {
  return Math.max(1, Math.trunc(rows)) * Math.max(1, Math.trunc(columns))
}

/**
 * Videos grid columns matching `md:grid-cols-2 xl:grid-cols-3`.
 * Callers pass matchMedia results (false until hydrated → mobile-safe 1 col).
 */
export function artistProfileVideoColumns(isMd: boolean, isXl: boolean): number {
  if (isXl) return 3
  if (isMd) return 2
  return 1
}

/** News grid columns matching `md:grid-cols-2`. */
export function artistProfileNewsColumns(isMd: boolean): number {
  return isMd ? 2 : 1
}
