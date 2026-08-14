import { describe, expect, it } from 'vitest'
import { computeOtherDigitalRevenue } from './artistPayoutBreakdown'
import type { ArtistRevenue } from './types'

function revenue(partial: Partial<ArtistRevenue>): ArtistRevenue {
  return {
    artist: 'Test',
    believeRevenue: 0,
    bandcampRevenue: 0,
    darkmerchRevenue: 0,
    manualRevenue: 0,
    totalRevenue: 0,
    splitPercentage: 50,
    finalAmount: 0,
    totalQuantity: 0,
    totalExpenses: 0,
    distributionFeeDeducted: 0,
    totalStreamRevenue: 0,
    totalDownloadRevenue: 0,
    platformBreakdown: [],
    countryBreakdown: [],
    monthlyBreakdown: [],
    releaseBreakdown: [],
    physicalReleasesRevenue: 0,
    digitalSplitPercentage: 50,
    believeSplitPercentage: 50,
    bandcampSplitPercentage: 50,
    physicalSplitPercentage: 50,
    darkmerchSplitPercentage: 50,
    ...partial,
  }
}

describe('computeOtherDigitalRevenue', () => {
  it('excludes believe and bandcamp from residual', () => {
    // total 1000 = believe 400 + bandcamp 200 + other 150 + physical 100 + darkmerch 150
    const result = computeOtherDigitalRevenue(
      revenue({
        totalRevenue: 1000,
        believeRevenue: 400,
        bandcampRevenue: 200,
        physicalReleasesRevenue: 100,
        darkmerchRevenue: 150,
      }),
    )
    expect(result).toBe(150)
  })

  it('does not double-count believe/bandcamp as "other digital"', () => {
    const brokenOldFormula = 400 + 200 + (1000 - 100 - 400 - 200 - 150) // 850
    const correct = computeOtherDigitalRevenue(
      revenue({
        totalRevenue: 1000,
        believeRevenue: 400,
        bandcampRevenue: 200,
        physicalReleasesRevenue: 100,
        darkmerchRevenue: 150,
      }),
    )
    expect(correct).toBeLessThan(brokenOldFormula)
    expect(correct).toBe(150)
  })

  it('floors residual at zero', () => {
    expect(
      computeOtherDigitalRevenue(
        revenue({
          totalRevenue: 100,
          believeRevenue: 80,
          bandcampRevenue: 50,
          physicalReleasesRevenue: 0,
          darkmerchRevenue: 0,
        }),
      ),
    ).toBe(0)
  })
})
