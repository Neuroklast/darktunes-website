import { describe, expect, it } from 'vitest'
import {
  buildProcessedArtistData,
  clampSplitPercentage,
  resolveDistributionFeeRate,
  resolveSplitPercentage,
  resolveSplitPercentageWithSourceOverride,
} from './fees'
import type { DataProcessorConfig } from './types'
import type { SalesTransaction } from '../ingest/csv-parser'

function makeTx(overrides: Partial<SalesTransaction>): SalesTransaction {
  return {
    id: 'tx-1',
    source: 'believe',
    sales_month: '2024-03',
    platform: 'Spotify',
    country: 'Germany',
    main_artist: 'Neuroklast',
    original_artist: 'Neuroklast',
    release_title: 'Album',
    track_title: 'Track',
    upc_ean: '',
    isrc: '',
    catalog_number: '',
    quantity: 100,
    net_revenue: 10,
    currency: 'EUR',
    is_physical: false,
    is_download: false,
    ...overrides,
  }
}

const baseConfig = (): DataProcessorConfig => ({
  compilationFilters: [],
  artistMappings: [],
  splitFees: [],
  manualRevenues: [],
  expenses: [],
  distributionFeePercentage: 10,
  distributionFeeDigital: 10,
  distributionFeePhysical: 5,
})

describe('split resolution helpers', () => {
  it('clampSplitPercentage constrains to 0–100', () => {
    expect(clampSplitPercentage(-5)).toBe(0)
    expect(clampSplitPercentage(150)).toBe(100)
    expect(clampSplitPercentage(50)).toBe(50)
  })

  it('resolveSplitPercentage prefers per-artist digital override', () => {
    expect(
      resolveSplitPercentage({ percentage: 50, digitalPercentage: 70 }, 'digital'),
    ).toBe(70)
    expect(
      resolveSplitPercentage({ percentage: 50, physicalPercentage: 40 }, 'physical'),
    ).toBe(40)
  })

  it('resolveSplitPercentageWithSourceOverride honours sourceOverrides', () => {
    const splitFee = {
      artist: 'Neuroklast',
      percentage: 50,
      sourceOverrides: [{ source: 'believe' as const, percentage: 80 }],
    }
    expect(
      resolveSplitPercentageWithSourceOverride(splitFee, 'believe', false, 100),
    ).toBe(80)
    expect(
      resolveSplitPercentageWithSourceOverride(splitFee, 'bandcamp', false, 100),
    ).toBe(50)
  })

  it('resolveSplitPercentageWithSourceOverride falls back to digital/physical % before globals', () => {
    const splitFee = {
      artist: 'Neuroklast',
      percentage: 50,
      digitalPercentage: 65,
      physicalPercentage: 35,
    }
    expect(
      resolveSplitPercentageWithSourceOverride(
        splitFee,
        'bandcamp',
        false,
        100,
        undefined,
        { believe: 70, bandcamp: 60 },
      ),
    ).toBe(65)
    expect(
      resolveSplitPercentageWithSourceOverride(
        splitFee,
        null,
        true,
        100,
        undefined,
        { physical: 45 },
      ),
    ).toBe(35)
  })

  it('resolveSplitPercentageWithSourceOverride uses global sourceSplits when no per-artist split', () => {
    expect(
      resolveSplitPercentageWithSourceOverride(
        undefined,
        'believe',
        false,
        100,
        undefined,
        { believe: 72, bandcamp: 55 },
      ),
    ).toBe(72)
    expect(
      resolveSplitPercentageWithSourceOverride(
        undefined,
        'shopify',
        true,
        100,
        undefined,
        { physical: 40 },
      ),
    ).toBe(40)
  })

  it('resolveSplitPercentageWithSourceOverride uses default type override before base default', () => {
    expect(
      resolveSplitPercentageWithSourceOverride(undefined, null, false, 100, 88),
    ).toBe(88)
    expect(
      resolveSplitPercentageWithSourceOverride(undefined, null, true, 100, 77),
    ).toBe(77)
  })

  it('resolveDistributionFeeRate uses override when set', () => {
    expect(resolveDistributionFeeRate(15, 10)).toBeCloseTo(0.15)
    expect(resolveDistributionFeeRate(undefined, 10)).toBeCloseTo(0.1)
  })
})

describe('buildProcessedArtistData', () => {
  it('applies separate digital and physical distribution fees', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [
        makeTx({ id: 'd', net_revenue: 100, is_physical: false }),
        makeTx({ id: 'p', net_revenue: 100, is_physical: true }),
      ],
      config: {
        ...baseConfig(),
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
      },
    })

    expect(result.distributionFeeDeducted).toBeCloseTo(15, 2)
    expect(result.finalPayout).toBeCloseTo(185, 2)
  })

  it('applies per-source believe bucket split', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [makeTx({ net_revenue: 100, source: 'believe' })],
      config: {
        ...baseConfig(),
        sourceSplits: { believe: 70 },
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
      },
    })

    expect(result.believeSplitPercentage).toBe(70)
    expect(result.finalPayout).toBeCloseTo(70, 2)
  })

  it('prioritises per-artist sourceOverrides over global sourceSplits', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [makeTx({ net_revenue: 100, source: 'believe' })],
      config: {
        ...baseConfig(),
        sourceSplits: { believe: 70 },
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [{
          artist: 'Neuroklast',
          percentage: 50,
          sourceOverrides: [{ source: 'believe', percentage: 85 }],
        }],
      },
    })

    expect(result.believeSplitPercentage).toBe(85)
    expect(result.finalPayout).toBeCloseTo(85, 2)
  })

  it('uses global sourceSplits for bandcamp bucket before per-artist digitalPercentage', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [makeTx({ net_revenue: 100, source: 'bandcamp' })],
      config: {
        ...baseConfig(),
        sourceSplits: { bandcamp: 60 },
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [{
          artist: 'Neuroklast',
          percentage: 50,
          digitalPercentage: 75,
        }],
      },
    })

    expect(result.bandcampSplitPercentage).toBe(60)
    expect(result.finalPayout).toBeCloseTo(60, 2)
  })

  it('applies per-artist digitalPercentage when no global bucket split is configured', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [makeTx({ net_revenue: 100, source: 'bandcamp' })],
      config: {
        ...baseConfig(),
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [{
          artist: 'Neuroklast',
          percentage: 50,
          digitalPercentage: 75,
        }],
      },
    })

    expect(result.bandcampSplitPercentage).toBe(75)
    expect(result.finalPayout).toBeCloseTo(75, 2)
  })

  it('prioritises shopify sourceOverride over physicalPercentage and global physical split', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [makeTx({ id: 's', net_revenue: 100, source: 'shopify', is_physical: true })],
      config: {
        ...baseConfig(),
        sourceSplits: { physical: 30 },
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [{
          artist: 'Neuroklast',
          percentage: 50,
          physicalPercentage: 40,
          sourceOverrides: [{ source: 'shopify', percentage: 62 }],
        }],
      },
    })

    expect(result.physicalSplitPercentage).toBe(62)
    expect(result.finalPayout).toBeCloseTo(62, 2)
  })

  it('uses per-artist darkmerch sourceOverride when global darkmerch split is configured', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [makeTx({ id: 'dm', net_revenue: 100, source: 'darkmerch', is_physical: true })],
      config: {
        ...baseConfig(),
        sourceSplits: { darkmerch: 80 },
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [{
          artist: 'Neuroklast',
          percentage: 50,
          sourceOverrides: [{ source: 'darkmerch', percentage: 91 }],
        }],
      },
    })

    expect(result.darkmerchSplitPercentage).toBe(91)
    expect(result.finalPayout).toBeCloseTo(91, 2)
  })

  it('applies release overrides per release title before bucket splits', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [
        makeTx({ id: 'a', release_title: 'Special Edition', net_revenue: 100, source: 'believe' }),
        makeTx({ id: 'b', release_title: 'Regular Album', net_revenue: 100, source: 'believe' }),
      ],
      config: {
        ...baseConfig(),
        sourceSplits: { believe: 70 },
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [{
          artist: 'Neuroklast',
          percentage: 70,
          releaseOverrides: [{ releaseTitle: 'special', percentage: 50 }],
        }],
      },
    })

    // Special Edition: 100 × 50% = 50; Regular Album: 100 × 70% = 70
    expect(result.finalPayout).toBeCloseTo(120, 2)
  })

  it('applies release physicalPercentage override to physical revenue within that release', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [
        makeTx({
          id: 'vinyl',
          release_title: 'Limited Vinyl',
          net_revenue: 100,
          source: 'shopify',
          is_physical: true,
        }),
      ],
      config: {
        ...baseConfig(),
        sourceSplits: { physical: 70 },
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [{
          artist: 'Neuroklast',
          percentage: 70,
          physicalPercentage: 60,
          releaseOverrides: [{ releaseTitle: 'limited', percentage: 80, physicalPercentage: 45 }],
        }],
      },
    })

    expect(result.finalPayout).toBeCloseTo(45, 2)
  })

  it('converts non-EUR Believe revenue using historical monthly FX rates', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [
        makeTx({
          net_revenue: 110,
          currency: 'USD',
          sales_month: '2024-03',
          source: 'believe',
        }),
      ],
      config: {
        ...baseConfig(),
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
        exchangeRates: { USD: 1.08 },
        historicalExchangeRates: { '2024-03': { USD: 1.10 } },
      },
    })

    // 110 USD / 1.10 = 100 EUR gross, 100% split, 0% fee
    expect(result.believeRevenue).toBeCloseTo(100, 2)
    expect(result.finalPayout).toBeCloseTo(100, 2)
  })

  it('matches Frozen Plasma workspace splits when grouping key strips spaces', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'frozenplasma',
      artist: 'Frozen Plasma',
      artistTransactions: [
        makeTx({
          id: 'believe',
          original_artist: 'FrozenPlasma',
          main_artist: 'Frozen Plasma',
          net_revenue: 100,
          source: 'believe',
        }),
        makeTx({
          id: 'bandcamp',
          original_artist: 'FrozenPlasma',
          main_artist: 'Frozen Plasma',
          net_revenue: 100,
          source: 'bandcamp',
        }),
      ],
      config: {
        ...baseConfig(),
        defaultSplitPercentage: 50,
        distributionFeePercentage: 0,
        distributionFeeDigital: 0,
        distributionFeePhysical: 0,
        splitFees: [
          { artist: 'FrozenPlasma', percentage: 50 },
          {
            artist: 'Frozen Plasma',
            percentage: 80,
            sourceOverrides: [
              { source: 'believe', percentage: 80 },
              { source: 'bandcamp', percentage: 50 },
            ],
          },
        ],
        manualRevenues: [{
          id: 'mr-fp',
          artist: 'Frozen Plasma',
          description: 'Sync',
          amount: 10,
        }],
        expenses: [{
          id: 'ex-fp',
          artist: 'Frozen Plasma',
          description: 'Recoup',
          amount: 5,
          date: '2024-03-01',
        }],
        carryForwardByArtist: { 'frozen plasma': 20 },
      },
    })

    expect(result.believeSplitPercentage).toBe(80)
    expect(result.bandcampSplitPercentage).toBe(50)
    expect(result.manualRevenue).toBe(10)
    expect(result.totalExpenses).toBe(5)
    expect(result.openingBalanceEur).toBe(20)
    // 80 + 50 + 10 - 5
    expect(result.finalPayout).toBeCloseTo(135, 2)
    expect(result.amountDueEur).toBeCloseTo(155, 2)
  })

  it('does not fold opening into finalPayout', () => {
    const result = buildProcessedArtistData({
      lowerKey: 'neuroklast',
      artist: 'Neuroklast',
      artistTransactions: [makeTx({ net_revenue: 100, source: 'believe' })],
      config: {
        ...baseConfig(),
        distributionFeePercentage: 10,
        distributionFeeDigital: 10,
        distributionFeePhysical: 10,
        splitFees: [{ artist: 'Neuroklast', percentage: 50 }],
        carryForwardByArtist: { neuroklast: 20 },
      },
    })

    expect(result.finalPayout).toBeCloseTo(45, 2)
    expect(result.openingBalanceEur).toBeCloseTo(20, 2)
    expect(result.amountDueEur).toBeCloseTo(65, 2)
  })
})