import { describe, expect, it } from 'vitest'
import {
  applyArtistShareToMerchOrders,
  applyArtistShareToTerritoryMetrics,
  type ArtistShareRates,
} from './applyArtistShareToPortalMetrics'
import type { TerritoryMetricRow } from '@/lib/sos/data-processor'
import type { MerchOrderRow } from '@/lib/sos/merchOrderRows'

function rates(partial: Partial<ArtistShareRates> & Pick<ArtistShareRates, 'artist'>): ArtistShareRates {
  return {
    splitPercentage: 50,
    digitalSplitPercentage: 50,
    believeSplitPercentage: 50,
    bandcampSplitPercentage: 50,
    physicalSplitPercentage: 50,
    darkmerchSplitPercentage: 50,
    ...partial,
  }
}

function metric(partial: Partial<TerritoryMetricRow> = {}): TerritoryMetricRow {
  return {
    artistName: 'Reaper',
    period: '2026-06',
    platform: 'Spotify',
    country: 'DE',
    streams: 10,
    revenueEur: 100,
    quantity: 0,
    ...partial,
  }
}

function merch(partial: Partial<MerchOrderRow> = {}): MerchOrderRow {
  return {
    externalId: 'm1',
    artistName: 'Reaper',
    source: 'shopify',
    period: '2026-06',
    productTitle: 'Shirt',
    country: 'DE',
    quantity: 1,
    revenueEur: 40,
    ...partial,
  }
}

describe('applyArtistShareToTerritoryMetrics', () => {
  it('leaves rows unchanged when no share rates are provided', () => {
    const rows = [metric()]
    expect(applyArtistShareToTerritoryMetrics(rows, [])).toBe(rows)
  })

  it('applies the digital / Believe share to streaming platforms', () => {
    const scaled = applyArtistShareToTerritoryMetrics(
      [metric({ revenueEur: 120.75 })],
      [rates({ artist: 'Reaper', believeSplitPercentage: 80, digitalSplitPercentage: 80 })],
    )
    expect(scaled[0]!.revenueEur).toBeCloseTo(96.6, 5)
  })

  it('applies the Bandcamp share only to Bandcamp rows', () => {
    const scaled = applyArtistShareToTerritoryMetrics(
      [
        metric({ platform: 'Spotify', revenueEur: 100 }),
        metric({ platform: 'Bandcamp', revenueEur: 100 }),
      ],
      [rates({
        artist: 'Reaper',
        believeSplitPercentage: 80,
        bandcampSplitPercentage: 50,
      })],
    )
    expect(scaled[0]!.revenueEur).toBeCloseTo(80, 5)
    expect(scaled[1]!.revenueEur).toBeCloseTo(50, 5)
  })

  it('matches FrozenPlasma metrics to a Frozen Plasma rate row', () => {
    const scaled = applyArtistShareToTerritoryMetrics(
      [metric({ artistName: 'FrozenPlasma', revenueEur: 20 })],
      [rates({ artist: 'Frozen Plasma', believeSplitPercentage: 50 })],
    )
    expect(scaled[0]!.revenueEur).toBeCloseTo(10, 5)
  })

  it('does not scale a row when the artist has no rate', () => {
    const scaled = applyArtistShareToTerritoryMetrics(
      [metric({ artistName: 'Unknown', revenueEur: 20 })],
      [rates({ artist: 'Reaper', believeSplitPercentage: 50 })],
    )
    expect(scaled[0]!.revenueEur).toBe(20)
  })

  it('keeps a zero share as zero revenue', () => {
    const scaled = applyArtistShareToTerritoryMetrics(
      [metric({ revenueEur: 20 })],
      [rates({ artist: 'Reaper', believeSplitPercentage: 0 })],
    )
    expect(scaled[0]!.revenueEur).toBe(0)
  })
})

describe('applyArtistShareToMerchOrders', () => {
  it('applies the physical share to Shopify merch', () => {
    const scaled = applyArtistShareToMerchOrders(
      [merch({ revenueEur: 40 })],
      [rates({ artist: 'Reaper', physicalSplitPercentage: 65 })],
    )
    expect(scaled[0]!.revenueEur).toBeCloseTo(26, 5)
  })

  it('applies the Darkmerch share to Darkmerch orders', () => {
    const scaled = applyArtistShareToMerchOrders(
      [merch({ source: 'darkmerch', revenueEur: 80 })],
      [rates({ artist: 'Reaper', darkmerchSplitPercentage: 100, physicalSplitPercentage: 65 })],
    )
    expect(scaled[0]!.revenueEur).toBeCloseTo(80, 5)
  })
})
