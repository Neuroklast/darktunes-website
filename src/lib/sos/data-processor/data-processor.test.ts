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
import { buildArtistRawSheets } from '../export/rawSourceRows'

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

  it('resolveMainArtist matches FrozenPlasma to a Frozen Plasma mapping', () => {
    expect(
      resolveMainArtist('FrozenPlasma', [{
        id: 'm-fp',
        featuringName: 'Frozen Plasma',
        primaryArtist: 'Frozen Plasma',
      }]),
    ).toBe('Frozen Plasma')
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

  it('excludes compilation revenue while retaining the audit summary', () => {
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
    expect(artistData).toHaveLength(0)
  })

  it('keeps excluded compilation rows out of the raw workbook while retaining ordinary sales', () => {
    const headers = ['Artist Name', 'Track Title', 'Net Revenue']
    const transactions = [
      makeTx({ id: 'comp', upc_ean: 'COMP-001', net_revenue: 40, source_row_id: 'comp',
        source_headers: headers, source_values: ['Neuroklast', 'Compilation', '40'] }),
      makeTx({ id: 'normal', upc_ean: 'NORMAL-001', net_revenue: 20, source_row_id: 'normal',
        source_headers: headers, source_values: ['Neuroklast', 'Track', '20'] }),
    ]
    const { artistData, filteredCompilations } = processTransactionsWithCompilations(transactions, {
      ...emptyConfig(),
      compilationFilters: [{ id: 'comp', type: 'ean', identifier: 'COMP-001', label: 'Comp' }],
    })
    expect(filteredCompilations[0]?.revenue).toBe(40)
    expect(artistData[0]?.grossRevenue).toBe(20)
    const rows = buildArtistRawSheets(artistData).get('neuroklast')?.[0]?.rows ?? []
    expect(rows).toEqual([['Neuroklast', 'Track', '20']])
  })

  it('does not restore a 100%-assigned track to a featuring artist through roster fallback', () => {
    const headers = ['Artist Name', 'Track Title', 'Net Revenue']
    const transactions = [
      makeTx({ id: 'satisfaction', original_artist: 'Exstais featuring Basila featuring Agnis',
        main_artist: 'Agnis', release_title: 'Satisfaction', track_title: 'Satisfaction',
        net_revenue: 250, source_row_id: 'satisfaction', source_headers: headers,
        source_values: ['Exstais featuring Basila featuring Agnis', 'Satisfaction', '250'] }),
      makeTx({ id: 'agnis-own', original_artist: 'Agnis', main_artist: 'Agnis',
        release_title: 'Own Release', track_title: 'Own Track', net_revenue: 12,
        source_row_id: 'agnis-own', source_headers: headers,
        source_values: ['Agnis', 'Own Track', '12'] }),
    ]
    const { artistData } = processTransactionsWithCompilations(transactions, {
      ...emptyConfig(),
      labelArtists: [{ id: 'exstais', name: 'Exstais' }, { id: 'agnis', name: 'Agnis' }],
      trackRevenueAssignments: [{ id: 'satisfaction', trackTitle: 'Satisfaction',
        owners: [{ artist: 'Exstais', percentage: 100 }, { artist: 'Agnis', percentage: 0 }] }],
    })
    expect(artistData.find(a => a.artist === 'Exstais')?.grossRevenue).toBe(250)
    expect(artistData.find(a => a.artist === 'Agnis')?.grossRevenue).toBe(12)
    const sheets = buildArtistRawSheets(artistData)
    expect(sheets.get('agnis')?.[0]?.rows).toEqual([['Agnis', 'Own Track', '12']])
    expect(sheets.get('exstais')?.[0]?.rows[0]?.[1]).toBe('Satisfaction')
  })

  it('sums compilation summary after FX conversion', () => {
    const { filteredCompilations } = processTransactionsWithCompilations(
      [makeTx({
        id: 'a',
        upc_ean: 'COMP-001',
        net_revenue: 108,
        currency: 'USD',
        sales_month: '2024-03',
      })],
      {
        ...emptyConfig(),
        compilationFilters: [{ id: 'comp', type: 'ean', identifier: 'COMP-001', label: 'Comp' }],
        exchangeRates: { USD: 1.08 },
      },
    )

    expect(filteredCompilations[0]?.revenue).toBeCloseTo(100, 5)
  })

  it('applies Frozen Plasma workspace splits when Bandcamp CSV artist is FrozenPlasma', () => {
    const { artistData } = processTransactionsWithCompilations(
      [
        makeTx({
          id: 'believe',
          source: 'believe',
          original_artist: 'FrozenPlasma',
          main_artist: 'FrozenPlasma',
          net_revenue: 100,
        }),
        makeTx({
          id: 'bandcamp',
          source: 'bandcamp',
          original_artist: 'FrozenPlasma',
          main_artist: 'FrozenPlasma',
          net_revenue: 100,
        }),
      ],
      {
        ...emptyConfig(),
        labelArtists: [{ id: 'fp', name: 'Frozen Plasma' }],
        defaultSplitPercentage: 50,
        distributionFeePercentage: 0,
        splitFees: [{
          artist: 'Frozen Plasma',
          percentage: 50,
          sourceOverrides: [
            { source: 'believe', percentage: 80 },
            { source: 'bandcamp', percentage: 50 },
          ],
        }],
      },
    )

    expect(artistData).toHaveLength(1)
    expect(artistData[0].artist).toBe('Frozen Plasma')
    expect(artistData[0].believeSplitPercentage).toBe(80)
    expect(artistData[0].bandcampSplitPercentage).toBe(50)
    expect(artistData[0].finalPayout).toBeCloseTo(130, 4)
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

  it('does not treat a short title as part of a longer title', () => {
    const rows = applyTrackRevenueAssignments(
      [{ ...makeTx({ id: 't1', track_title: 'Nightfall', release_title: 'Album' }), main_artist: 'Neuroklast' }],
      [{
        id: 'a1',
        trackTitle: 'Night',
        owners: [{ artist: 'Thief', percentage: 100 }],
      }],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.main_artist).toBe('Neuroklast')
  })

  it('lets the longer exact title win when track and release rules both match', () => {
    const rows = applyTrackRevenueAssignments(
      [{ ...makeTx({ id: 't1', track_title: 'EP', release_title: 'Nightfall' }), main_artist: 'Neuroklast' }],
      [
        { id: 'short', trackTitle: 'EP', owners: [{ artist: 'Short', percentage: 100 }] },
        { id: 'long', trackTitle: 'Nightfall', owners: [{ artist: 'Long', percentage: 100 }] },
      ],
    )
    expect(rows[0]?.main_artist).toBe('Long')
  })

  it('prefers the track title when both exact rules are the same length', () => {
    const rows = applyTrackRevenueAssignments(
      [{ ...makeTx({ id: 't1', track_title: 'Cut', release_title: 'Bar' }), main_artist: 'Neuroklast' }],
      [
        { id: 'rel', trackTitle: 'Bar', owners: [{ artist: 'ReleaseOwner', percentage: 100 }] },
        { id: 'trk', trackTitle: 'Cut', owners: [{ artist: 'TrackOwner', percentage: 100 }] },
      ],
    )
    expect(rows[0]?.main_artist).toBe('TrackOwner')
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