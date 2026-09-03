/**
 * Pure helpers for multi-scale Spotify presence charts.
 * Absolute dual-axis vs index (100) mode for shape comparison.
 */

export type PresenceChartMode = 'absolute' | 'index'

export type PresenceSeriesKey =
  | 'listeners'
  | 'followers'
  | 'albumTrackPlays'
  | 'topTracksPlays'
  | 'lastfm'
  | 'soundcharts'

export const PRESENCE_SERIES_KEYS: PresenceSeriesKey[] = [
  'listeners',
  'followers',
  'albumTrackPlays',
  'topTracksPlays',
  'lastfm',
  'soundcharts',
]

/**
 * Curated, muted series palette tuned for the dark (#101010 / #292929) theme.
 * Anchored on the CI primary/violet family; moderate chroma (no neon) and
 * enough lightness to stay legible against near-black surfaces.
 */
export const PRESENCE_SERIES_COLORS: Record<PresenceSeriesKey, string> = {
  listeners: 'oklch(0.74 0.16 280)',
  followers: 'oklch(0.66 0.13 292)',
  albumTrackPlays: 'oklch(0.72 0.13 158)',
  topTracksPlays: 'oklch(0.70 0.11 198)',
  lastfm: 'oklch(0.74 0.12 42)',
  soundcharts: 'oklch(0.68 0.10 327)',
}

/**
 * Coherent muted ramp for the donut charts (share by track / by release).
 * Reuses the same hue families as the series so the whole panel stays calm.
 */
export const PRESENCE_DONUT_PALETTE: string[] = [
  'oklch(0.74 0.16 280)',
  'oklch(0.72 0.13 158)',
  'oklch(0.74 0.12 42)',
  'oklch(0.68 0.10 327)',
  'oklch(0.70 0.11 198)',
  'oklch(0.66 0.13 292)',
  'oklch(0.72 0.12 205)',
  'oklch(0.64 0.10 300)',
]

/** Audience-scale series (left Y-axis in absolute mode). */
export const AUDIENCE_SERIES: PresenceSeriesKey[] = [
  'listeners',
  'followers',
  'lastfm',
  'soundcharts',
]

/** Play-count-scale series (right Y-axis in absolute mode). */
export const PLAYS_SERIES: PresenceSeriesKey[] = ['albumTrackPlays', 'topTracksPlays']

export type PresenceChartRow = {
  period: string
} & Partial<Record<PresenceSeriesKey, number>>

/**
 * Rebase each series so the first non-zero value becomes 100.
 * Missing / zero baselines leave the series as zeros.
 */
export function toIndexChartData(
  rows: PresenceChartRow[],
  seriesKeys: PresenceSeriesKey[],
): PresenceChartRow[] {
  const bases = new Map<PresenceSeriesKey, number>()
  for (const key of seriesKeys) {
    for (const row of rows) {
      const v = row[key] ?? 0
      if (v > 0) {
        bases.set(key, v)
        break
      }
    }
  }
  return rows.map((row) => {
    const next: PresenceChartRow = { period: row.period }
    for (const key of seriesKeys) {
      const base = bases.get(key)
      const raw = row[key] ?? 0
      if (!base || base === 0) {
        next[key] = 0
      } else {
        next[key] = Math.round((raw / base) * 1000) / 10
      }
    }
    return next
  })
}

export function seriesHasData(rows: PresenceChartRow[], key: PresenceSeriesKey): boolean {
  return rows.some((r) => (r[key] ?? 0) > 0)
}
