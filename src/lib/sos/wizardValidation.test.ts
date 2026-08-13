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
    expect(issues.some((i) => i.id === 'unknown-artist-unknown act')).toBe(true)
    expect(wizardHasBlockingIssues(issues)).toBe(false)
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
})