import { describe, expect, it } from 'vitest'
import { validateSosWizardState, wizardHasBlockingIssues } from './wizardValidation'

describe('wizardValidation', () => {
  it('flags missing period as blocking error', () => {
    const issues = validateSosWizardState({
      revenues: [],
      labelArtists: [],
      splitFees: [],
      periodStart: '',
      periodEnd: '',
      hasBelieveFile: false,
      hasBandcampFile: false,
      hasShopifyFile: false,
      hasPrintfulFile: false,
      hasDarkmerchFile: false,
    })
    expect(wizardHasBlockingIssues(issues)).toBe(true)
    expect(issues.some((i) => i.id === 'missing-period')).toBe(true)
  })

  it('warns on unknown artists with revenue', () => {
    const issues = validateSosWizardState({
      revenues: [
        {
          artist: 'Unknown Act',
          believeRevenue: 10,
          bandcampRevenue: 0,
          darkmerchRevenue: 0,
          manualRevenue: 0,
          totalRevenue: 10,
          splitPercentage: 50,
          finalAmount: 5,
          totalQuantity: 0,
          totalExpenses: 0,
          distributionFeeDeducted: 0,
          totalStreamRevenue: 10,
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
        },
      ],
      labelArtists: [{ id: '1', name: 'Roster Artist' }],
      splitFees: [],
      periodStart: '2025-01',
      periodEnd: '2025-03',
      hasBelieveFile: true,
      hasBandcampFile: false,
      hasShopifyFile: false,
      hasPrintfulFile: false,
      hasDarkmerchFile: false,
    })
    expect(issues.some((i) => i.id === 'unknown-artist-unknownact')).toBe(true)
    expect(wizardHasBlockingIssues(issues)).toBe(false)
  })

  it('treats FrozenPlasma as the Frozen Plasma roster artist', () => {
    const issues = validateSosWizardState({
      revenues: [
        {
          artist: 'FrozenPlasma',
          believeRevenue: 10,
          bandcampRevenue: 0,
          darkmerchRevenue: 0,
          manualRevenue: 0,
          totalRevenue: 10,
          splitPercentage: 50,
          finalAmount: 5,
          totalQuantity: 0,
          totalExpenses: 0,
          distributionFeeDeducted: 0,
          totalStreamRevenue: 10,
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
        },
      ],
      labelArtists: [{ id: '1', name: 'Frozen Plasma', artistId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }],
      splitFees: [{ artist: 'Frozen Plasma', percentage: 50 }],
      periodStart: '2026-06',
      periodEnd: '2026-06',
      hasBelieveFile: false,
      hasBandcampFile: true,
      hasShopifyFile: false,
      hasPrintfulFile: false,
      hasDarkmerchFile: false,
    })
    expect(issues.some((i) => i.id.startsWith('unknown-artist-'))).toBe(false)
    expect(issues.some((i) => i.id.startsWith('no-portal-id-'))).toBe(false)
  })

  it('blocks track assignments that do not sum to 100 percent', () => {
    const issues = validateSosWizardState({
      revenues: [],
      labelArtists: [{ id: '1', name: 'Roster Artist', artistId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }],
      splitFees: [],
      periodStart: '2025-01',
      periodEnd: '2025-03',
      hasBelieveFile: true,
      hasBandcampFile: false,
      hasShopifyFile: false,
      hasPrintfulFile: false,
      hasDarkmerchFile: false,
      trackRevenueAssignments: [{
        id: 'a1',
        trackTitle: 'Nightfall',
        owners: [
          { artist: 'Alpha', percentage: 70 },
          { artist: 'Beta', percentage: 20 },
        ],
      }],
    })
    expect(issues.some((i) => i.id === 'track-split-nightfall')).toBe(true)
    expect(wizardHasBlockingIssues(issues)).toBe(true)
  })

  it('warns on parse skips and empty currency without blocking', () => {
    const issues = validateSosWizardState({
      revenues: [
        {
          artist: 'Roster Artist',
          believeRevenue: 10,
          bandcampRevenue: 0,
          darkmerchRevenue: 0,
          manualRevenue: 0,
          totalRevenue: 10,
          splitPercentage: 50,
          finalAmount: 5,
          totalQuantity: 0,
          totalExpenses: 0,
          distributionFeeDeducted: 0,
          totalStreamRevenue: 10,
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
        },
      ],
      labelArtists: [{ id: '1', name: 'Roster Artist', artistId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }],
      splitFees: [{ artist: 'Roster Artist', percentage: 50 }],
      periodStart: '2025-01',
      periodEnd: '2025-03',
      hasBelieveFile: true,
      hasBandcampFile: true,
      hasShopifyFile: false,
      hasPrintfulFile: false,
      hasDarkmerchFile: false,
      skippedRowCount: 4,
      skipReasons: ['bandcamp-payout', 'empty-line'],
      emptyCurrencyRowCount: 2,
    })
    expect(issues.some((i) => i.id === 'parse-skips')).toBe(true)
    expect(issues.some((i) => i.id === 'empty-currency')).toBe(true)
    expect(wizardHasBlockingIssues(issues)).toBe(false)
  })
})