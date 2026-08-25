import { describe, expect, it } from 'vitest'
import { computeAdminRevenueKpis, matchesAdminSearch } from './adminInsights'
import type { ArtistRevenue } from '@/lib/sos/types'

const baseRevenue = (overrides: Partial<ArtistRevenue>): ArtistRevenue => ({
  artist: 'Band A',
  totalRevenue: 100,
  finalAmount: 80,
  believeRevenue: 60,
  bandcampRevenue: 30,
  darkmerchRevenue: 10,
  manualRevenue: 0,
  splitPercentage: 80,
  totalQuantity: 0,
  totalExpenses: 0,
  distributionFeeDeducted: 0,
  totalStreamRevenue: 50,
  totalDownloadRevenue: 20,
  physicalReleasesRevenue: 5,
  platformBreakdown: [],
  countryBreakdown: [{ country: 'DE', revenue: 70, quantity: 1000 }],
  monthlyBreakdown: [],
  releaseBreakdown: [],
  digitalSplitPercentage: 80,
  believeSplitPercentage: 80,
  bandcampSplitPercentage: 80,
  physicalSplitPercentage: 80,
  darkmerchSplitPercentage: 80,
  ...overrides,
})

describe('computeAdminRevenueKpis', () => {
  it('sums revenue across artists', () => {
    const kpis = computeAdminRevenueKpis([
      baseRevenue({ totalRevenue: 100 }),
      baseRevenue({ artist: 'Band B', totalRevenue: 50 }),
    ])
    expect(kpis.totalRevenue).toBe(150)
    expect(kpis.artistCount).toBe(2)
    expect(kpis.topArtist).toBe('Band A')
  })
})

describe('matchesAdminSearch', () => {
  it('matches artist and country', () => {
    const r = baseRevenue({})
    expect(matchesAdminSearch('band', r)).toBe(true)
    expect(matchesAdminSearch('de', r)).toBe(true)
    expect(matchesAdminSearch('fr', r)).toBe(false)
  })
})