import { describe, it, expect } from 'vitest'
import { toIndexChartData, seriesHasData, type PresenceChartRow } from './presenceChartUtils'

describe('toIndexChartData', () => {
  it('rebases each series to 100 at first non-zero', () => {
    const rows: PresenceChartRow[] = [
      { period: '2026-01', listeners: 1000, albumTrackPlays: 1_000_000 },
      { period: '2026-02', listeners: 1100, albumTrackPlays: 1_100_000 },
      { period: '2026-03', listeners: 900, albumTrackPlays: 1_200_000 },
    ]
    const indexed = toIndexChartData(rows, ['listeners', 'albumTrackPlays'])
    expect(indexed[0]?.listeners).toBe(100)
    expect(indexed[0]?.albumTrackPlays).toBe(100)
    expect(indexed[1]?.listeners).toBe(110)
    expect(indexed[1]?.albumTrackPlays).toBe(110)
    expect(indexed[2]?.listeners).toBe(90)
    expect(indexed[2]?.albumTrackPlays).toBe(120)
  })

  it('handles zero baselines', () => {
    const rows: PresenceChartRow[] = [
      { period: '2026-01', listeners: 0 },
      { period: '2026-02', listeners: 50 },
    ]
    const indexed = toIndexChartData(rows, ['listeners'])
    expect(indexed[0]?.listeners).toBe(0)
    expect(indexed[1]?.listeners).toBe(100)
  })
})

describe('seriesHasData', () => {
  it('detects positive values', () => {
    const rows: PresenceChartRow[] = [{ period: 'a', listeners: 0, followers: 3 }]
    expect(seriesHasData(rows, 'listeners')).toBe(false)
    expect(seriesHasData(rows, 'followers')).toBe(true)
  })
})
