import { describe, expect, it } from 'vitest'
import type { SalesTransaction } from '../ingest/csv-parser'
import type { DataProcessorConfig } from './types'
import { processTransactionsWithCompilations } from './index'

function tx(overrides: Partial<SalesTransaction>): SalesTransaction {
  return {
    id: 'tx',
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
    quantity: 10,
    net_revenue: 100,
    currency: 'EUR',
    is_physical: false,
    is_download: false,
    ...overrides,
  }
}

const zeroFees = {
  distributionFeePercentage: 0,
  distributionFeeDigital: 0,
  distributionFeePhysical: 0,
}

function config(overrides: Partial<DataProcessorConfig> = {}): DataProcessorConfig {
  return {
    compilationFilters: [],
    artistMappings: [],
    splitFees: [],
    manualRevenues: [],
    expenses: [],
    ...overrides,
  }
}

describe('calculation reference — pipeline', () => {
  it('excludes compilation rows from payout and lists them for audit', () => {
    const { artistData, filteredCompilations } = processTransactionsWithCompilations(
      [
        tx({ id: 'own', net_revenue: 80, upc_ean: 'OWN-1' }),
        tx({ id: 'comp', net_revenue: 20, upc_ean: 'COMP-1', release_title: 'Sampler Hits' }),
      ],
      config({
        ...zeroFees,
        compilationFilters: [{ id: 'comp', type: 'ean', identifier: 'COMP-1', label: 'Sampler' }],
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
      }),
    )

    expect(filteredCompilations).toEqual([
      expect.objectContaining({ identifier: 'COMP-1', revenue: 20, transactionCount: 1 }),
    ])
    expect(artistData[0]?.grossRevenue).toBe(80)
    expect(artistData[0]?.finalPayout).toBeCloseTo(80, 6)
  })

  it('drops ignored releases from payout instead of only hiding them', () => {
    const { artistData } = processTransactionsWithCompilations(
      [
        tx({ id: 'keep', release_title: 'Keep', net_revenue: 70 }),
        tx({ id: 'drop', release_title: 'Drop Me', net_revenue: 30 }),
      ],
      config({
        ...zeroFees,
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
        ignoredEntries: [
          { id: 'ig', artist: 'Neuroklast', releaseTitle: 'Drop Me', createdAt: '2024-03-01T00:00:00.000Z' },
        ],
      }),
    )

    expect(artistData[0]?.grossRevenue).toBe(70)
    expect(artistData[0]?.finalPayout).toBeCloseTo(70, 6)
  })

  it('drops every row for an artist when the ignored entry has no release title', () => {
    const { artistData } = processTransactionsWithCompilations(
      [tx({ id: 'any', net_revenue: 50 })],
      config({
        ...zeroFees,
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
        ignoredEntries: [
          { id: 'ig', artist: 'Neuroklast', createdAt: '2024-03-01T00:00:00.000Z' },
        ],
      }),
    )

    expect(artistData).toHaveLength(0)
  })

  it('splits a 60/40 track across roster artists through the full pipeline', () => {
    const { artistData } = processTransactionsWithCompilations(
      [tx({ id: 'duet', track_title: 'Duet', net_revenue: 100 })],
      config({
        ...zeroFees,
        labelArtists: [
          { id: 'a', name: 'Neuroklast' },
          { id: 'b', name: 'Guest Act' },
        ],
        splitFees: [
          { artist: 'Neuroklast', percentage: 100 },
          { artist: 'Guest Act', percentage: 100 },
        ],
        trackRevenueAssignments: [{
          id: 'split',
          trackTitle: 'Duet',
          owners: [
            { artist: 'Neuroklast', percentage: 60 },
            { artist: 'Guest Act', percentage: 40 },
          ],
        }],
      }),
    )

    const byName = Object.fromEntries(artistData.map((row) => [row.artist, row.finalPayout]))
    expect(byName.Neuroklast).toBeCloseTo(60, 6)
    expect(byName['Guest Act']).toBeCloseTo(40, 6)
  })

  it('keeps an incomplete track split on the original artist', () => {
    const { artistData } = processTransactionsWithCompilations(
      [tx({ id: 'duet', track_title: 'Duet', net_revenue: 100 })],
      config({
        ...zeroFees,
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
        trackRevenueAssignments: [{
          id: 'split',
          trackTitle: 'Duet',
          owners: [
            { artist: 'Neuroklast', percentage: 70 },
            { artist: 'Guest Act', percentage: 20 },
          ],
        }],
      }),
    )

    expect(artistData).toHaveLength(1)
    expect(artistData[0]?.artist).toBe('Neuroklast')
    expect(artistData[0]?.finalPayout).toBeCloseTo(100, 6)
  })

  it('applies bucket splits after fees, then manual minus expenses, opening only on amount due', () => {
    const { artistData } = processTransactionsWithCompilations(
      [
        tx({ id: 'believe', source: 'believe', net_revenue: 200 }),
        tx({ id: 'bandcamp', source: 'bandcamp', net_revenue: 100 }),
        tx({ id: 'shopify', source: 'shopify', is_physical: true, net_revenue: 80 }),
      ],
      config({
        distributionFeePercentage: 10,
        distributionFeeDigital: 10,
        distributionFeePhysical: 5,
        sourceSplits: { believe: 70 },
        splitFees: [{
          artist: 'Neuroklast',
          percentage: 50,
          digitalPercentage: 80,
          physicalPercentage: 40,
          sourceOverrides: [{ source: 'bandcamp', percentage: 50 }],
        }],
        manualRevenues: [{ id: 'mr', artist: 'Neuroklast', description: 'Sync', amount: 15 }],
        expenses: [{ id: 'ex', artist: 'Neuroklast', description: 'Recoup', amount: 10, date: '2024-03-01' }],
        carryForwardByArtist: { neuroklast: 20 },
      }),
    )

    const row = artistData[0]
    expect(row?.believeSplitPercentage).toBe(70)
    expect(row?.bandcampSplitPercentage).toBe(50)
    expect(row?.physicalSplitPercentage).toBe(40)
    expect(row?.distributionFeeDeducted).toBeCloseTo(34, 6)
    expect(row?.finalPayout).toBeCloseTo(206.4, 6)
    expect(row?.openingBalanceEur).toBe(20)
    expect(row?.amountDueEur).toBeCloseTo(226.4, 6)
  })

  it('lets a global Believe source split beat the artist digital percentage', () => {
    const { artistData } = processTransactionsWithCompilations(
      [tx({ source: 'believe', net_revenue: 100 })],
      config({
        ...zeroFees,
        sourceSplits: { believe: 70 },
        splitFees: [{ artist: 'Neuroklast', percentage: 50, digitalPercentage: 90 }],
      }),
    )

    expect(artistData[0]?.believeSplitPercentage).toBe(70)
    expect(artistData[0]?.finalPayout).toBeCloseTo(70, 6)
  })
})
