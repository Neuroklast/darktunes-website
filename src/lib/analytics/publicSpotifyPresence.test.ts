import { describe, it, expect } from 'vitest'
import type { ArtistListenerMetric } from '@/lib/api/artistListenerMetrics'
import type { SpotifyTrackPlaySnapshot } from '@/lib/api/spotifyTrackPlaySnapshots'
import type { StreamingStat } from '@/lib/api/streamingStats'
import {
  buildPublicSpotifyPresenceModel,
  topTracksForPeriod,
  playsByReleaseForPeriod,
  aggregateTrackPlaysByPeriod,
  normalizeTrackName,
} from './publicSpotifyPresence'

function metric(
  partial: Partial<ArtistListenerMetric> & Pick<ArtistListenerMetric, 'metricType' | 'period' | 'value'>,
): ArtistListenerMetric {
  return {
    id: partial.id ?? `m-${partial.metricType}-${partial.period}`,
    artistId: 'artist-1',
    source: partial.source ?? 'apify',
    metricType: partial.metricType,
    period: partial.period,
    value: partial.value,
    country: '',
    fetchedAt: partial.fetchedAt ?? '2026-07-01T00:00:00.000Z',
  }
}

function snap(
  partial: Partial<SpotifyTrackPlaySnapshot> & Pick<SpotifyTrackPlaySnapshot, 'spotifyTrackId' | 'playCount' | 'period'>,
): SpotifyTrackPlaySnapshot {
  return {
    id: partial.id ?? `s-${partial.spotifyTrackId}`,
    artistId: 'artist-1',
    releaseId: partial.releaseId ?? 'rel-1',
    spotifyTrackId: partial.spotifyTrackId,
    spotifyAlbumId: 'alb-1',
    // Default name unique per id so unrelated tests are not collapsed by waterfall dedupe
    trackName: partial.trackName ?? `Track ${partial.spotifyTrackId}`,
    playCount: partial.playCount,
    period: partial.period,
    scrapedAt: partial.scrapedAt ?? '2026-07-01T00:00:00.000Z',
  }
}

describe('aggregateTrackPlaysByPeriod', () => {
  it('sums play counts per period for distinct songs', () => {
    const points = aggregateTrackPlaysByPeriod([
      snap({ spotifyTrackId: 't1', trackName: 'A', playCount: 100, period: '2026-06' }),
      snap({ spotifyTrackId: 't2', trackName: 'B', playCount: 50, period: '2026-06' }),
      snap({ spotifyTrackId: 't1', trackName: 'A', playCount: 200, period: '2026-07' }),
    ])
    expect(points).toEqual([
      { period: '2026-06', value: 150 },
      { period: '2026-07', value: 200 },
    ])
  })

  it('does not double-count waterfall re-releases of the same song', () => {
    const points = aggregateTrackPlaysByPeriod([
      snap({
        spotifyTrackId: 'single-uri',
        trackName: 'Hit Song',
        playCount: 1_000_000,
        period: '2026-07',
        releaseId: 'r-single',
      }),
      snap({
        spotifyTrackId: 'album-uri',
        trackName: 'Hit Song',
        playCount: 1_050_000,
        period: '2026-07',
        releaseId: 'r-album',
      }),
      snap({
        spotifyTrackId: 'other',
        trackName: 'B-Side',
        playCount: 10_000,
        period: '2026-07',
        releaseId: 'r-album',
      }),
    ])
    // max(Hit Song) + B-Side — not sum of both Hit Song rows
    expect(points).toEqual([{ period: '2026-07', value: 1_060_000 }])
  })
})

describe('topTracksForPeriod', () => {
  it('ranks tracks and computes share for latest period only', () => {
    const rows = topTracksForPeriod(
      [
        snap({ spotifyTrackId: 't1', trackName: 'A', playCount: 75, period: '2026-07' }),
        snap({ spotifyTrackId: 't2', trackName: 'B', playCount: 25, period: '2026-07' }),
        snap({ spotifyTrackId: 't3', trackName: 'Old', playCount: 999, period: '2026-06' }),
      ],
      '2026-07',
      { 'rel-1': 'Album X' },
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]?.trackName).toBe('A')
    expect(rows[0]?.sharePct).toBe(75)
    expect(rows[0]?.releaseTitle).toBe('Album X')
  })

  it('shows each song once by name and keeps max plays only', () => {
    const rows = topTracksForPeriod(
      [
        snap({
          spotifyTrackId: 's1',
          trackName: 'Waterfall Hit',
          playCount: 500,
          period: '2026-07',
          releaseId: 'r1',
        }),
        snap({
          spotifyTrackId: 's2',
          trackName: 'Waterfall Hit (feat. Guest)',
          playCount: 520,
          period: '2026-07',
          releaseId: 'r2',
        }),
        snap({
          spotifyTrackId: 's3',
          trackName: 'Other Song',
          playCount: 100,
          period: '2026-07',
          releaseId: 'r2',
        }),
      ],
      '2026-07',
      { r1: 'Single', r2: 'Album' },
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]?.playCount).toBe(520)
    expect(rows[0]?.sharePct).toBe(83.9) // 520/620
    expect(rows.filter((r) => normalizeTrackName(r.trackName) === 'waterfall hit')).toHaveLength(1)
  })
})

describe('playsByReleaseForPeriod', () => {
  it('groups by release', () => {
    const rows = playsByReleaseForPeriod(
      [
        snap({ spotifyTrackId: 't1', playCount: 10, period: '2026-07', releaseId: 'r1' }),
        snap({ spotifyTrackId: 't2', playCount: 30, period: '2026-07', releaseId: 'r1' }),
        snap({ spotifyTrackId: 't3', playCount: 60, period: '2026-07', releaseId: 'r2' }),
      ],
      '2026-07',
      { r1: 'One', r2: 'Two' },
    )
    expect(rows[0]?.releaseTitle).toBe('Two')
    expect(rows[0]?.playCount).toBe(60)
    expect(rows[1]?.trackCount).toBe(2)
  })
})

describe('buildPublicSpotifyPresenceModel', () => {
  it('builds KPIs for listeners and followers without mixing SOS', () => {
    const model = buildPublicSpotifyPresenceModel({
      listenerMetrics: [
        metric({ metricType: 'listeners', period: '2026-06', value: 1000 }),
        metric({ metricType: 'listeners', period: '2026-07', value: 1200 }),
        metric({ metricType: 'followers', period: '2026-07', value: 500 }),
        metric({ source: 'lastfm', metricType: 'listeners', period: '2026-07', value: 50 }),
      ],
      trackSnapshots: [
        snap({ spotifyTrackId: 't1', playCount: 1000, period: '2026-07' }),
        snap({ spotifyTrackId: 't2', playCount: 500, period: '2026-07' }),
      ],
      releaseTitles: { 'rel-1': 'Debut' },
    })

    expect(model.kpis.hasAnyData).toBe(true)
    expect(model.kpis.latestListeners).toBe(1200)
    expect(model.kpis.latestFollowers).toBe(500)
    expect(model.kpis.latestPublicTrackPlays).toBe(1500)
    expect(model.kpis.listenersMomPct).toBe(20)
    expect(model.topTracks[0]?.playCount).toBe(1000)
    expect(model.secondaryListeners.lastfm).toHaveLength(1)
    expect(model.trend.at(-1)?.listeners).toBe(1200)
  })

  it('returns empty-ish model when no public data', () => {
    const model = buildPublicSpotifyPresenceModel({
      listenerMetrics: [],
      trackSnapshots: [],
    })
    expect(model.kpis.hasAnyData).toBe(false)
    expect(model.topTracks).toEqual([])
    expect(model.insights).toEqual([])
  })

  it('emits listener growth insight when MoM exceeds threshold', () => {
    const model = buildPublicSpotifyPresenceModel({
      listenerMetrics: [
        metric({ metricType: 'listeners', period: '2026-06', value: 100 }),
        metric({ metricType: 'listeners', period: '2026-07', value: 150 }),
      ],
      trackSnapshots: [],
    })
    expect(model.insights.some((i) => i.id === 'public-listeners-mom')).toBe(true)
  })

  it('emits stale insight when scrape is old', () => {
    const model = buildPublicSpotifyPresenceModel({
      listenerMetrics: [
        metric({
          metricType: 'listeners',
          period: '2026-01',
          value: 100,
          fetchedAt: '2026-01-01T00:00:00.000Z',
        }),
      ],
      trackSnapshots: [],
      now: new Date('2026-07-01T00:00:00.000Z'),
    })
    expect(model.insights.some((i) => i.id === 'public-stale')).toBe(true)
  })

  it('can correlate SOS Spotify streams with public listeners', () => {
    const sosStats: StreamingStat[] = [
      { id: '1', artistId: 'a', platform: 'Spotify', period: '2026-04', streams: 100, createdAt: '' },
      { id: '2', artistId: 'a', platform: 'Spotify', period: '2026-05', streams: 200, createdAt: '' },
      { id: '3', artistId: 'a', platform: 'Spotify', period: '2026-06', streams: 300, createdAt: '' },
    ]
    const model = buildPublicSpotifyPresenceModel({
      listenerMetrics: [
        metric({ metricType: 'listeners', period: '2026-04', value: 10 }),
        metric({ metricType: 'listeners', period: '2026-05', value: 20 }),
        metric({ metricType: 'listeners', period: '2026-06', value: 30 }),
      ],
      trackSnapshots: [],
      sosStats,
      now: new Date('2026-06-15T00:00:00.000Z'),
    })
    expect(model.insights.some((i) => i.id === 'public-vs-statement-corr')).toBe(true)
  })
})
