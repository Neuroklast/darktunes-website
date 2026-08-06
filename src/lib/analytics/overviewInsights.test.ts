import { describe, it, expect } from 'vitest'
import { computeOverviewInsights } from './overviewInsights'
import type { StreamingStat } from '@/lib/api/streamingStats'

describe('computeOverviewInsights', () => {
  it('returns growth insight when streams increase significantly', () => {
    const stats: StreamingStat[] = [
      { id: '1', artistId: 'a', platform: 'Spotify', period: '2025-01', streams: 100, createdAt: '' },
      { id: '2', artistId: 'a', platform: 'Spotify', period: '2025-02', streams: 150, createdAt: '' },
    ]
    const insights = computeOverviewInsights({
      stats,
      statements: [],
      settlement: null,
      promoImpacts: [],
      analyticsEnabled: true,
    })
    expect(insights.some((i) => i.id === 'overview-growth')).toBe(true)
  })

  it('returns empty when analytics disabled', () => {
    const insights = computeOverviewInsights({
      stats: [],
      statements: [],
      settlement: null,
      promoImpacts: [],
      analyticsEnabled: false,
    })
    expect(insights).toHaveLength(0)
  })

  it('links SOS analytics hrefs with artistId when provided', () => {
    const stats: StreamingStat[] = [
      { id: '1', artistId: 'a', platform: 'Spotify', period: '2025-01', streams: 100, createdAt: '' },
      { id: '2', artistId: 'a', platform: 'Spotify', period: '2025-02', streams: 150, createdAt: '' },
    ]
    const insights = computeOverviewInsights({
      stats,
      statements: [],
      settlement: null,
      promoImpacts: [],
      analyticsEnabled: true,
      artistId: 'artist-uuid-1',
    })
    const growth = insights.find((i) => i.id === 'overview-growth')
    expect(growth?.href).toContain('/portal/sos-analytics')
    expect(growth?.href).toContain('artistId=artist-uuid-1')
    expect(growth?.href).toContain('tab=streaming')
  })
})