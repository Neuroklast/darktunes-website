import { describe, expect, it, vi } from 'vitest'
import type { ArtistRevenue } from '@/lib/sos/types'
import { persistAnalyticsAfterStatementUpload } from './persistAfterStatementUpload'

function makeArtistRevenue(overrides: Partial<ArtistRevenue> & Pick<ArtistRevenue, 'artist'>): ArtistRevenue {
  return {
    believeRevenue: 0,
    bandcampRevenue: 0,
    darkmerchRevenue: 0,
    manualRevenue: 0,
    totalRevenue: 0,
    splitPercentage: 100,
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
    digitalSplitPercentage: 100,
    believeSplitPercentage: 100,
    bandcampSplitPercentage: 100,
    physicalSplitPercentage: 100,
    darkmerchSplitPercentage: 100,
    ...overrides,
  }
}

vi.mock('@/lib/sos/runPersistSosAnalytics', () => ({
  runPersistSosAnalytics: vi.fn(async () => ({ success: true, merchOrdersUpserted: 2 })),
}))

import { runPersistSosAnalytics } from '@/lib/sos/runPersistSosAnalytics'

describe('persistAnalyticsAfterStatementUpload', () => {
  it('passes filtered merch rows for the published artist', async () => {
    await persistAnalyticsAfterStatementUpload({
      artistName: 'Band A',
      periodStart: '2024-01',
      periodEnd: '2024-01',
      territoryMetrics: [{
        artistName: 'Band A',
        period: '2024-01',
        platform: 'Spotify',
        country: 'DE',
        streams: 10,
        revenueEur: 1,
        quantity: 0,
      }],
      merchOrderRows: [
        {
          externalId: 'm1',
          artistName: 'Band A',
          source: 'shopify',
          period: '2024-01',
          productTitle: 'Shirt',
          country: 'DE',
          quantity: 1,
          revenueEur: 25,
        },
        {
          externalId: 'm2',
          artistName: 'Band B',
          source: 'shopify',
          period: '2024-01',
          productTitle: 'Hoodie',
          country: 'DE',
          quantity: 1,
          revenueEur: 40,
        },
      ],
      labelArtists: [{ id: '1', name: 'Band A', artistId: 'artist-1' }],
      revenues: [],
      bronzeBatchIds: [],
    })

    expect(runPersistSosAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        merchOrderRows: [expect.objectContaining({ externalId: 'm1', artistName: 'Band A' })],
      }),
    )
  })

  it('skips persist when the artist has no territory metrics', async () => {
    vi.mocked(runPersistSosAnalytics).mockClear()

    await persistAnalyticsAfterStatementUpload({
      artistName: 'Unknown',
      periodStart: '2024-01',
      periodEnd: '2024-01',
      territoryMetrics: [{
        artistName: 'Band A',
        period: '2024-01',
        platform: 'Spotify',
        country: 'DE',
        streams: 10,
        revenueEur: 1,
        quantity: 0,
      }],
      merchOrderRows: [],
      labelArtists: [],
      revenues: [],
      bronzeBatchIds: [],
    })

    expect(runPersistSosAnalytics).not.toHaveBeenCalled()
  })

  it('does not upsert period summary on draft upload', async () => {
    vi.mocked(runPersistSosAnalytics).mockClear()

    await persistAnalyticsAfterStatementUpload({
      artistName: 'Band A',
      periodStart: '2024-01',
      periodEnd: '2024-01',
      territoryMetrics: [{
        artistName: 'Band A',
        period: '2024-01',
        platform: 'Spotify',
        country: 'DE',
        streams: 10,
        revenueEur: 1,
        quantity: 0,
      }],
      merchOrderRows: [],
      labelArtists: [{ id: '1', name: 'Band A', artistId: 'artist-1' }],
      revenues: [
        makeArtistRevenue({
          artist: 'Band A',
          totalRevenue: 500,
          finalAmount: 400,
        }),
      ],
      bronzeBatchIds: ['batch-1'],
    })

    expect(runPersistSosAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ includePeriodSummary: false }),
    )
  })
})