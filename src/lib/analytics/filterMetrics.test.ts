import { describe, expect, it } from 'vitest'
import {
  collectAvailablePeriods,
  filterStreamingStats,
  filterTerritoryMetrics,
  filterListenerMetrics,
  resolvePeriodPreset,
} from './filterMetrics'
import type { ArtistListenerMetric } from '@/lib/api/artistListenerMetrics'
import type { StreamingStat } from '@/lib/api/streamingStats'
import type { ArtistTerritoryMetric } from '@/lib/api/artistTerritoryMetrics'

const baseStat = (overrides: Partial<StreamingStat>): StreamingStat => ({
  id: '1',
  artistId: 'a1',
  platform: 'Spotify',
  period: '2024-01',
  streams: 100,
  createdAt: '2024-01-01',
  ...overrides,
})

const baseMetric = (overrides: Partial<ArtistTerritoryMetric>): ArtistTerritoryMetric => ({
  id: '1',
  artistId: 'a1',
  period: '2024-01',
  platform: 'Spotify',
  country: 'DE',
  streams: 50,
  revenueEur: 1.5,
  quantity: 0,
  sourceBatchId: undefined,
  updatedAt: '2024-01-01',
  ...overrides,
})

describe('filterMetrics', () => {
  it('collects sorted unique periods', () => {
    const periods = collectAvailablePeriods(
      [baseStat({ period: '2024-03' }), baseStat({ period: '2024-01' })],
      [baseMetric({ period: '2024-02' })],
    )
    expect(periods).toEqual(['2024-01', '2024-02', '2024-03'])
  })

  it('resolves rolling period presets from available periods', () => {
    const periods = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05']
    expect(resolvePeriodPreset(periods, '3m')).toEqual({
      periodFrom: '2024-03',
      periodTo: '2024-05',
    })
    expect(resolvePeriodPreset(periods, 'all')).toEqual({
      periodFrom: '',
      periodTo: '',
    })
  })

  it('filters streaming stats by period range and platform', () => {
    const stats = [
      baseStat({ period: '2024-01', platform: 'Spotify' }),
      baseStat({ period: '2024-02', platform: 'Apple Music' }),
      baseStat({ period: '2024-03', platform: 'Spotify' }),
    ]
    const filtered = filterStreamingStats(stats, {
      periodFrom: '2024-02',
      periodTo: '2024-03',
      platform: 'Spotify',
      country: '',
    })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.period).toBe('2024-03')
  })

  it('filters territory metrics by country', () => {
    const metrics = [
      baseMetric({ country: 'DE' }),
      baseMetric({ id: '2', country: 'US' }),
    ]
    const filtered = filterTerritoryMetrics(metrics, {
      periodFrom: '',
      periodTo: '',
      platform: '',
      country: 'US',
    })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.country).toBe('US')
  })

  it('filters listener metrics by period range', () => {
    const metrics: ArtistListenerMetric[] = [
      {
        id: '1',
        artistId: 'a1',
        source: 'lastfm',
        metricType: 'listeners',
        period: '2024-01',
        value: 100,
        country: '',
        fetchedAt: '2024-01-01',
      },
      {
        id: '2',
        artistId: 'a1',
        source: 'lastfm',
        metricType: 'listeners',
        period: '2024-03',
        value: 200,
        country: '',
        fetchedAt: '2024-03-01',
      },
    ]
    const filtered = filterListenerMetrics(metrics, {
      periodFrom: '2024-02',
      periodTo: '',
      platform: '',
      country: '',
    })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.period).toBe('2024-03')
  })
})