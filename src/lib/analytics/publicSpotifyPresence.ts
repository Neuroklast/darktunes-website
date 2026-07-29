/**
 * Pure aggregations for public Spotify presence metrics
 * (DB source may be `apify` — never expose that name to artists).
 */

import type { ArtistListenerMetric } from '@/lib/api/artistListenerMetrics'
import type { SpotifyTrackPlaySnapshot } from '@/lib/api/spotifyTrackPlaySnapshots'
import type { StreamingStat } from '@/lib/api/streamingStats'
import type { AnalyticsInsight } from '@/lib/analytics/insights'
import {
  GROWTH_SIGNIFICANT_PCT,
  TREND_MIN_PERIODS,
} from '@/lib/analytics/constants'

/** Internal DB source for public Spotify scrape — map to UI as spotifyPublic only. */
export const PUBLIC_SPOTIFY_SOURCE = 'apify' as const

export const STALE_PUBLIC_STATS_DAYS = 45
export const TOP_TRACK_CONCENTRATION_THRESHOLD = 0.6
export const TOP_TRACKS_LIMIT = 15

export interface PeriodPoint {
  period: string
  value: number
}

export interface PublicSpotifyKpis {
  latestListeners: number | null
  latestFollowers: number | null
  latestPublicTrackPlays: number | null
  listenersMomPct: number | null
  followersMomPct: number | null
  trackCountLatest: number
  releaseCountLatest: number
  latestPeriod: string | null
  latestScrapedAt: string | null
  hasAnyData: boolean
}

export interface TopTrackRow {
  spotifyTrackId: string
  trackName: string | null
  releaseId: string | null
  releaseTitle: string | null
  playCount: number
  sharePct: number
}

export interface ReleasePlayRow {
  releaseId: string | null
  releaseTitle: string | null
  playCount: number
  trackCount: number
  sharePct: number
}

export interface PublicSpotifyTrendPoint {
  period: string
  listeners: number
  followers: number
  /** Sum of top-track stream counts from artist scrape (metric_type plays), if any */
  topTracksPlays: number
  /** Sum of album track play snapshots for the period */
  albumTrackPlays: number
}

export interface PublicSpotifyPresenceModel {
  kpis: PublicSpotifyKpis
  trend: PublicSpotifyTrendPoint[]
  topTracks: TopTrackRow[]
  byRelease: ReleasePlayRow[]
  insights: AnalyticsInsight[]
  /** Secondary non-Spotify listener sources for optional chart series */
  secondaryListeners: {
    lastfm: PeriodPoint[]
    soundcharts: PeriodPoint[]
  }
}

function momGrowth(points: PeriodPoint[]): number | null {
  if (points.length < 2) return null
  const sorted = [...points].sort((a, b) => a.period.localeCompare(b.period))
  const prev = sorted[sorted.length - 2]!.value
  const last = sorted[sorted.length - 1]!.value
  if (prev === 0) return last > 0 ? 100 : 0
  return Math.round(((last - prev) / prev) * 10000) / 100
}

function seriesFor(
  metrics: ArtistListenerMetric[],
  source: string,
  metricType: string,
): PeriodPoint[] {
  const byPeriod = new Map<string, number>()
  for (const m of metrics) {
    if (m.source !== source || m.metricType !== metricType) continue
    byPeriod.set(m.period, m.value)
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }))
}

function latestOf(points: PeriodPoint[]): number | null {
  if (points.length === 0) return null
  return points[points.length - 1]!.value
}

function latestPeriodOf(points: PeriodPoint[]): string | null {
  if (points.length === 0) return null
  return points[points.length - 1]!.period
}

export function filterTrackPlaySnapshots(
  snapshots: SpotifyTrackPlaySnapshot[],
  periodFrom: string,
  periodTo: string,
): SpotifyTrackPlaySnapshot[] {
  return snapshots.filter((s) => {
    if (periodFrom && s.period < periodFrom) return false
    if (periodTo && s.period > periodTo) return false
    return true
  })
}

export function aggregateTrackPlaysByPeriod(
  snapshots: SpotifyTrackPlaySnapshot[],
): PeriodPoint[] {
  const map = new Map<string, number>()
  for (const s of snapshots) {
    map.set(s.period, (map.get(s.period) ?? 0) + s.playCount)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }))
}

/** Prefer the most recent period that has snapshot rows. */
export function resolveLatestSnapshotPeriod(
  snapshots: SpotifyTrackPlaySnapshot[],
): string | null {
  if (snapshots.length === 0) return null
  let max = snapshots[0]!.period
  for (const s of snapshots) {
    if (s.period > max) max = s.period
  }
  return max
}

export function topTracksForPeriod(
  snapshots: SpotifyTrackPlaySnapshot[],
  period: string | null,
  releaseTitles: Record<string, string> = {},
  limit = TOP_TRACKS_LIMIT,
): TopTrackRow[] {
  if (!period) return []
  const rows = snapshots.filter((s) => s.period === period)
  const total = rows.reduce((sum, r) => sum + r.playCount, 0)
  const sorted = [...rows].sort((a, b) => b.playCount - a.playCount).slice(0, limit)
  return sorted.map((r) => ({
    spotifyTrackId: r.spotifyTrackId,
    trackName: r.trackName,
    releaseId: r.releaseId,
    releaseTitle: r.releaseId ? (releaseTitles[r.releaseId] ?? null) : null,
    playCount: r.playCount,
    sharePct: total > 0 ? Math.round((r.playCount / total) * 1000) / 10 : 0,
  }))
}

export function playsByReleaseForPeriod(
  snapshots: SpotifyTrackPlaySnapshot[],
  period: string | null,
  releaseTitles: Record<string, string> = {},
): ReleasePlayRow[] {
  if (!period) return []
  const rows = snapshots.filter((s) => s.period === period)
  const byRelease = new Map<string, { playCount: number; trackCount: number; releaseId: string | null }>()
  for (const r of rows) {
    const key = r.releaseId ?? '__none__'
    const prev = byRelease.get(key) ?? { playCount: 0, trackCount: 0, releaseId: r.releaseId }
    prev.playCount += r.playCount
    prev.trackCount += 1
    byRelease.set(key, prev)
  }
  const total = rows.reduce((sum, r) => sum + r.playCount, 0)
  return [...byRelease.values()]
    .map((v) => ({
      releaseId: v.releaseId,
      releaseTitle: v.releaseId ? (releaseTitles[v.releaseId] ?? null) : null,
      playCount: v.playCount,
      trackCount: v.trackCount,
      sharePct: total > 0 ? Math.round((v.playCount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.playCount - a.playCount)
}

function buildTrend(
  listeners: PeriodPoint[],
  followers: PeriodPoint[],
  topTracksPlays: PeriodPoint[],
  albumTrackPlays: PeriodPoint[],
): PublicSpotifyTrendPoint[] {
  const periods = new Set<string>()
  for (const p of listeners) periods.add(p.period)
  for (const p of followers) periods.add(p.period)
  for (const p of topTracksPlays) periods.add(p.period)
  for (const p of albumTrackPlays) periods.add(p.period)
  const lMap = new Map(listeners.map((p) => [p.period, p.value]))
  const fMap = new Map(followers.map((p) => [p.period, p.value]))
  const tMap = new Map(topTracksPlays.map((p) => [p.period, p.value]))
  const aMap = new Map(albumTrackPlays.map((p) => [p.period, p.value]))
  return [...periods]
    .sort()
    .map((period) => ({
      period,
      listeners: lMap.get(period) ?? 0,
      followers: fMap.get(period) ?? 0,
      topTracksPlays: tMap.get(period) ?? 0,
      albumTrackPlays: aMap.get(period) ?? 0,
    }))
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < TREND_MIN_PERIODS) return null
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX
    const dy = ys[i]! - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const denom = Math.sqrt(denX * denY)
  if (denom === 0) return null
  return Math.round((num / denom) * 1000) / 1000
}

function sosSpotifyStreamsByPeriod(stats: StreamingStat[]): PeriodPoint[] {
  const map = new Map<string, number>()
  for (const s of stats) {
    if (!/spotify/i.test(s.platform)) continue
    map.set(s.period, (map.get(s.period) ?? 0) + s.streams)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }))
}

export function computePublicSpotifyInsights(input: {
  listeners: PeriodPoint[]
  followers: PeriodPoint[]
  topTracks: TopTrackRow[]
  albumTrackPlays: PeriodPoint[]
  latestScrapedAt: string | null
  sosStats?: StreamingStat[]
  now?: Date
}): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = []
  const {
    listeners,
    followers,
    topTracks,
    albumTrackPlays,
    latestScrapedAt,
    sosStats = [],
    now = new Date(),
  } = input

  const listenersMom = momGrowth(listeners)
  if (listenersMom !== null && Math.abs(listenersMom) >= GROWTH_SIGNIFICANT_PCT) {
    insights.push({
      id: 'public-listeners-mom',
      severity: listenersMom >= 0 ? 'positive' : 'negative',
      titleKey:
        listenersMom >= 0
          ? 'analytics_presence_insight_listeners_up_title'
          : 'analytics_presence_insight_listeners_down_title',
      bodyKey:
        listenersMom >= 0
          ? 'analytics_presence_insight_listeners_up_body'
          : 'analytics_presence_insight_listeners_down_body',
      values: { pct: Math.abs(listenersMom) },
    })
  }

  const followersMom = momGrowth(followers)
  if (followersMom !== null && Math.abs(followersMom) >= GROWTH_SIGNIFICANT_PCT) {
    insights.push({
      id: 'public-followers-mom',
      severity: followersMom >= 0 ? 'positive' : 'negative',
      titleKey:
        followersMom >= 0
          ? 'analytics_presence_insight_followers_up_title'
          : 'analytics_presence_insight_followers_down_title',
      bodyKey:
        followersMom >= 0
          ? 'analytics_presence_insight_followers_up_body'
          : 'analytics_presence_insight_followers_down_body',
      values: { pct: Math.abs(followersMom) },
    })
  }

  if (topTracks.length >= 3) {
    const top3Share = topTracks.slice(0, 3).reduce((s, t) => s + t.sharePct, 0)
    if (top3Share >= TOP_TRACK_CONCENTRATION_THRESHOLD * 100) {
      insights.push({
        id: 'public-track-concentration',
        severity: 'info',
        titleKey: 'analytics_presence_insight_concentration_title',
        bodyKey: 'analytics_presence_insight_concentration_body',
        values: { pct: Math.round(top3Share * 10) / 10 },
      })
    }
  }

  if (topTracks.length >= 5) {
    const plays = topTracks.map((t) => t.playCount)
    const median = [...plays].sort((a, b) => a - b)[Math.floor(plays.length / 2)] ?? 0
    const above = plays.filter((p) => p > median).length
    if (above >= 3) {
      insights.push({
        id: 'public-catalog-breadth',
        severity: 'positive',
        titleKey: 'analytics_presence_insight_breadth_title',
        bodyKey: 'analytics_presence_insight_breadth_body',
        values: { count: above },
      })
    }
  }

  // Correlative only — different metrics (statement Spotify streams vs public listeners)
  const sosSpotify = sosSpotifyStreamsByPeriod(sosStats)
  if (sosSpotify.length >= TREND_MIN_PERIODS && listeners.length >= TREND_MIN_PERIODS) {
    const periods = [...new Set([...sosSpotify.map((p) => p.period), ...listeners.map((p) => p.period)])].sort()
    const sMap = new Map(sosSpotify.map((p) => [p.period, p.value]))
    const lMap = new Map(listeners.map((p) => [p.period, p.value]))
    const xs: number[] = []
    const ys: number[] = []
    for (const p of periods) {
      if (sMap.has(p) && lMap.has(p)) {
        xs.push(sMap.get(p)!)
        ys.push(lMap.get(p)!)
      }
    }
    const corr = pearson(xs, ys)
    if (corr !== null && Math.abs(corr) >= 0.6) {
      insights.push({
        id: 'public-vs-statement-corr',
        severity: 'info',
        titleKey: 'analytics_presence_insight_cross_title',
        bodyKey: 'analytics_presence_insight_cross_body',
        values: { corr: Math.abs(corr) },
      })
    }
  }

  if (latestScrapedAt) {
    const scraped = Date.parse(latestScrapedAt)
    if (!Number.isNaN(scraped)) {
      const ageDays = (now.getTime() - scraped) / (1000 * 60 * 60 * 24)
      if (ageDays > STALE_PUBLIC_STATS_DAYS) {
        insights.push({
          id: 'public-stale',
          severity: 'info',
          titleKey: 'analytics_presence_insight_stale_title',
          bodyKey: 'analytics_presence_insight_stale_body',
          values: { days: Math.floor(ageDays) },
        })
      }
    }
  }

  // Album track plays growth
  const albumMom = momGrowth(albumTrackPlays)
  if (albumMom !== null && Math.abs(albumMom) >= GROWTH_SIGNIFICANT_PCT) {
    insights.push({
      id: 'public-album-plays-mom',
      severity: albumMom >= 0 ? 'positive' : 'negative',
      titleKey:
        albumMom >= 0
          ? 'analytics_presence_insight_plays_up_title'
          : 'analytics_presence_insight_plays_down_title',
      bodyKey:
        albumMom >= 0
          ? 'analytics_presence_insight_plays_up_body'
          : 'analytics_presence_insight_plays_down_body',
      values: { pct: Math.abs(albumMom) },
    })
  }

  return insights
}

export function buildPublicSpotifyPresenceModel(input: {
  listenerMetrics: ArtistListenerMetric[]
  trackSnapshots: SpotifyTrackPlaySnapshot[]
  releaseTitles?: Record<string, string>
  sosStats?: StreamingStat[]
  now?: Date
}): PublicSpotifyPresenceModel {
  const {
    listenerMetrics,
    trackSnapshots,
    releaseTitles = {},
    sosStats = [],
    now,
  } = input

  const listeners = seriesFor(listenerMetrics, PUBLIC_SPOTIFY_SOURCE, 'listeners')
  const followers = seriesFor(listenerMetrics, PUBLIC_SPOTIFY_SOURCE, 'followers')
  const topTracksPlaysSeries = seriesFor(listenerMetrics, PUBLIC_SPOTIFY_SOURCE, 'plays')
  const albumTrackPlays = aggregateTrackPlaysByPeriod(trackSnapshots)
  const latestSnapPeriod = resolveLatestSnapshotPeriod(trackSnapshots)
  const topTracks = topTracksForPeriod(trackSnapshots, latestSnapPeriod, releaseTitles)
  const byRelease = playsByReleaseForPeriod(trackSnapshots, latestSnapPeriod, releaseTitles)

  let latestScrapedAt: string | null = null
  for (const s of trackSnapshots) {
    if (!latestScrapedAt || s.scrapedAt > latestScrapedAt) latestScrapedAt = s.scrapedAt
  }
  for (const m of listenerMetrics) {
    if (m.source !== PUBLIC_SPOTIFY_SOURCE) continue
    if (!latestScrapedAt || m.fetchedAt > latestScrapedAt) latestScrapedAt = m.fetchedAt
  }

  const latestListeners = latestOf(listeners)
  const latestFollowers = latestOf(followers)
  const latestAlbumPlays = latestOf(albumTrackPlays)

  const latestPeriod =
    latestPeriodOf(listeners) ??
    latestPeriodOf(followers) ??
    latestSnapPeriod ??
    latestPeriodOf(albumTrackPlays)

  const trackCountLatest = latestSnapPeriod
    ? trackSnapshots.filter((s) => s.period === latestSnapPeriod).length
    : 0
  const releaseCountLatest = byRelease.filter((r) => r.releaseId).length

  const hasAnyData =
    listeners.length > 0 ||
    followers.length > 0 ||
    topTracksPlaysSeries.length > 0 ||
    trackSnapshots.length > 0

  const kpis: PublicSpotifyKpis = {
    latestListeners,
    latestFollowers,
    latestPublicTrackPlays: latestAlbumPlays,
    listenersMomPct: momGrowth(listeners),
    followersMomPct: momGrowth(followers),
    trackCountLatest,
    releaseCountLatest,
    latestPeriod,
    latestScrapedAt,
    hasAnyData,
  }

  const insights = computePublicSpotifyInsights({
    listeners,
    followers,
    topTracks,
    albumTrackPlays,
    latestScrapedAt,
    sosStats,
    now,
  })

  return {
    kpis,
    trend: buildTrend(listeners, followers, topTracksPlaysSeries, albumTrackPlays),
    topTracks,
    byRelease,
    insights,
    secondaryListeners: {
      lastfm: seriesFor(listenerMetrics, 'lastfm', 'listeners'),
      soundcharts: seriesFor(listenerMetrics, 'soundcharts', 'listeners'),
    },
  }
}
