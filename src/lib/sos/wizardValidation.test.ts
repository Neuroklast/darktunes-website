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

  it('blocks when session files are not archived', () => {
    const issues = validateSosWizardState({
      revenues: [],
      labelArtists: [],
      splitFees: [],
      periodStart: '2025-01',
      periodEnd: '2025-03',
      hasBelieveFile: true,
      hasBandcampFile: false,
      hasShopifyFile: false,
      hasPrintfulFile: false,
      hasDarkmerchFile: false,
      unarchivedSourceFiles: ['Believe_Q1_2026.csv'],
    })
    expect(issues.some((i) => i.id === 'incomplete-archive')).toBe(true)
    expect(wizardHasBlockingIssues(issues)).toBe(true)
  })
  it('shows a nonblocking warning for unusually long periods and mismatched source dates', () => {
    const issues = validateSosWizardState({
      revenues: [],
      labelArtists: [],
      splitFees: [],
      periodStart: '2025-01',
      periodEnd: '2026-06',
      hasBelieveFile: true,
      hasBandcampFile: false,
      hasShopifyFile: false,
      hasPrintfulFile: false,
      hasDarkmerchFile: false,
      sourcePeriods: [
        { name: 'Believe_older.csv', start: '2024-12', end: '2025-03' },
        { name: 'Bandcamp_inside.csv', start: '2025-02', end: '2025-05' },
      ],
    })
    expect(issues.find(issue => issue.id === 'unusually-long-period')?.title).toContain('18')
    expect(issues.find(issue => issue.id === 'source-period-outside')?.description).toContain('Believe_older.csv')
    expect(issues.find(issue => issue.id === 'source-period-outside')?.description).not.toContain('Bandcamp_inside.csv')
    expect(issues.find(issue => issue.id === 'source-period-outside')?.severity).toBe('warning')
  })

  it('does not invent warnings for invalid source dates or a single-month period', () => {
    const issues = validateSosWizardState({
      revenues: [],
      labelArtists: [],
      splitFees: [],
      periodStart: '2026-02',
      periodEnd: '2026-02',
      hasBelieveFile: true,
      hasBandcampFile: false,
      hasShopifyFile: false,
      hasPrintfulFile: false,
      hasDarkmerchFile: false,
      sourcePeriods: [{ name: 'Unknown.csv', start: 'not-a-date', end: '2026-01' }],
    })
    expect(issues.find(issue => issue.id === 'unusually-long-period')).toBeUndefined()
    expect(issues.find(issue => issue.id === 'source-period-outside')).toBeUndefined()
  })

})