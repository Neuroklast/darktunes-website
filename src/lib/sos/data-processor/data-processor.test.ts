import { describe, expect, it } from 'vitest'
import type { SalesTransaction } from '../ingest/csv-parser'
import type { DataProcessorConfig } from './types'
import {
  isCompilation,
  resolveMainArtist,
  processTransactionsWithCompilations,
  aggregateTerritoryMetrics,
} from './index'
import { applyTrackRevenueAssignments } from './distribution'

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

const emptyConfig = (): DataProcessorConfig => ({
  compilationFilters: [],
  artistMappings: [],
  splitFees: [],
  manualRevenues: [],
})

describe('distribution helpers', () => {
  it('resolveMainArtist maps featuring aliases to primary artist', () => {
    expect(
      resolveMainArtist('Guest Act', [{ id: 'm1', featuringName: 'Guest Act', primaryArtist: 'Neuroklast' }]),
    ).toBe('Neuroklast')
  })

  it('isCompilation matches EAN filter exactly', () => {
    const tx = makeTx({ upc_ean: '1234567890123' })
    expect(
      isCompilation(tx, [{ id: 'c1', type: 'ean', identifier: '1234567890123', label: 'Comp' }]),
    ).toBe(true)
    expect(
      isCompilation(tx, [{ id: 'c1', type: 'ean', identifier: '123', label: 'Comp' }]),
    ).toBe(false)
  })
})

describe('processTransactionsWithCompilations', () => {
  it('applies 50% split and 10% distribution fee on digital streaming revenue', () => {
    const { artistData } = processTransactionsWithCompilations(
      [makeTx({ id: 'a', net_revenue: 100 })],
      {
        ...emptyConfig(),
        splitFees: [{ artist: 'Neuroklast', percentage: 50 }],
        distributionFeePercentage: 10,
      },
    )

    expect(artistData).toHaveLength(1)
    const row = artistData[0]
    expect(row.grossRevenue).toBe(100)
    expect(row.distributionFeeDeducted).toBeCloseTo(10, 4)
    expect(row.digitalRevenueAfterFee).toBeCloseTo(90, 4)
    expect(row.finalPayout).toBeCloseTo(45, 4)
    expect(row.splitPercentage).toBe(50)
  })

  it('adds manual revenue after split and subtracts expenses', () => {
    const { artistData } = processTransactionsWithCompilations(
      [makeTx({ id: 'a', net_revenue: 100 })],
      {
        ...emptyConfig(),
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
        manualRevenues: [{ id: 'mr1', artist: 'Neuroklast', description: 'Bonus', amount: 25 }],
        expenses: [{ id: 'ex1', artist: 'Neuroklast', description: 'Recoup', amount: 10, date: '2024-03-01' }],
      },
    )

    const row = artistData[0]
    expect(row.manualRevenue).toBe(25)
    expect(row.totalExpenses).toBe(10)
    expect(row.finalPayout).toBeCloseTo(115, 4)
  })

  it('keeps opening off final payout and reports it separately', () => {
    const { artistData } = processTransactionsWithCompilations(
      [makeTx({ id: 'a', net_revenue: 50 })],
      {
        ...emptyConfig(),
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
        carryForwardByArtist: { neuroklast: -12.5 },
      },
    )

    expect(artistData[0].finalPayout).toBeCloseTo(50, 4)
    expect(artistData[0].openingBalanceEur).toBeCloseTo(-12.5, 4)
    expect(artistData[0].amountDueEur).toBeCloseTo(37.5, 4)
  })

  it('filters transactions to label roster artists', () => {
    const { artistData } = processTransactionsWithCompilations(
      [
        makeTx({ id: 'a', original_artist: 'Neuroklast', main_artist: 'Neuroklast' }),
        makeTx({ id: 'b', original_artist: 'Unknown Artist', main_artist: 'Unknown Artist' }),
      ],
      {
        ...emptyConfig(),
        labelArtists: [{ id: 'artist-1', name: 'Neuroklast' }],
      },
    )

    expect(artistData).toHaveLength(1)
    expect(artistData[0].artist).toBe('Neuroklast')
  })

  it('still counts compilation revenue while listing filtered compilations', () => {
    const { artistData, filteredCompilations } = processTransactionsWithCompilations(
      [makeTx({ id: 'a', upc_ean: 'COMP-001', net_revenue: 40 })],
      {
        ...emptyConfig(),
        compilationFilters: [{ id: 'comp', type: 'ean', identifier: 'COMP-001', label: 'Comp' }],
        splitFees: [{ artist: 'Neuroklast', percentage: 100 }],
      },
    )

    expect(filteredCompilations).toHaveLength(1)
    expect(filteredCompilations[0].revenue).toBe(40)
    expect(artistData[0].grossRevenue).toBe(40)
  })

  it('honours per-source believe split bucket', () => {
    const { artistData } = processTransactionsWithCompilations(
      [makeTx({ id: 'a', source: 'believe', net_revenue: 100 })],
      {
        ...emptyConfig(),
        sourceSplits: { believe: 70 },
      },
    )

    expect(artistData[0].believeSplitPercentage).toBe(70)
    expect(artistData[0].finalPayout).toBeCloseTo(70, 4)
  })
})

describe('applyTrackRevenueAssignments', () => {
  it('splits 60/40 with last-owner residual', () => {
    const rows = applyTrackRevenueAssignments(
      [{ ...makeTx({ id: 't1', net_revenue: 100, quantity: 10 }), main_artist: 'Neuroklast' }],
      [{
        id: 'a1',
        trackTitle: 'Track',
        owners: [
          { artist: 'Alpha', percentage: 60 },
          { artist: 'Beta', percentage: 40 },
        ],
      }],
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].net_revenue + rows[1].net_revenue).toBeCloseTo(100, 8)
    expect(rows.map((r) => r.main_artist).sort()).toEqual(['Alpha', 'Beta'])
  })

  it('does not leak revenue when owner percentages do not sum to 100', () => {
    const original = { ...makeTx({ id: 't1', net_revenue: 100 }), main_artist: 'Neuroklast' }
    const rows = applyTrackRevenueAssignments(
      [original],
      [{
        id: 'a1',
        trackTitle: 'Track',
        owners: [
          { artist: 'Alpha', percentage: 70 },
          { artist: 'Beta', percentage: 20 },
        ],
      }],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].net_revenue).toBe(100)
    expect(rows[0].main_artist).toBe('Neuroklast')
  })
})

describe('aggregateTerritoryMetrics', () => {
  it('aggregates streams and revenue by artist, period, platform, and country', () => {
    const artistData = processTransactionsWithCompilations(
      [
        makeTx({ id: 'a', quantity: 100, net_revenue: 2 }),
        makeTx({ id: 'b', quantity: 50, net_revenue: 1 }),
        makeTx({ id: 'c', country: 'Poland', quantity: 30, net_revenue: 0.5 }),
      ],
      emptyConfig(),
    ).artistData

    const result = aggregateTerritoryMetrics(artistData)
    expect(result).toHaveLength(2)

    const de = result.find(r => r.country === 'Germany')
    expect(de).toMatchObject({
      artistName: 'Neuroklast',
      period: '2024-03',
      platform: 'Spotify',
      streams: 150,
      revenueEur: 3,
      quantity: 150,
    })
  })
})