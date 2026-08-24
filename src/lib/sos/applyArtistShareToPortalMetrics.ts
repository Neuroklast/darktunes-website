/**
 * Scale portal gold revenue by the artist's label share.
 * Excel / SOS reporting stay on the unscaled processor amounts.
 */

import { normalizeArtistNameKey } from '@/lib/sos/artistNameKey'
import type { TerritoryMetricRow } from '@/lib/sos/data-processor'
import type { MerchOrderRow } from '@/lib/sos/merchOrderRows'
import type { ArtistRevenue } from '@/lib/sos/types'

export interface ArtistShareRates {
  artist: string
  splitPercentage: number
  digitalSplitPercentage: number
  believeSplitPercentage: number
  bandcampSplitPercentage: number
  physicalSplitPercentage: number
  darkmerchSplitPercentage: number
}

export function toArtistShareRates(revenue: ArtistRevenue): ArtistShareRates {
  const fallback = revenue.splitPercentage
  return {
    artist: revenue.artist,
    splitPercentage: fallback,
    digitalSplitPercentage: revenue.digitalSplitPercentage ?? fallback,
    believeSplitPercentage: revenue.believeSplitPercentage ?? revenue.digitalSplitPercentage ?? fallback,
    bandcampSplitPercentage: revenue.bandcampSplitPercentage ?? revenue.digitalSplitPercentage ?? fallback,
    physicalSplitPercentage: revenue.physicalSplitPercentage ?? fallback,
    darkmerchSplitPercentage: revenue.darkmerchSplitPercentage ?? fallback,
  }
}

function clampSharePercent(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(100, Math.max(0, value))
}

function lookupRates(
  artistName: string,
  rates: readonly ArtistShareRates[],
): ArtistShareRates | undefined {
  const key = normalizeArtistNameKey(artistName)
  return rates.find((row) => normalizeArtistNameKey(row.artist) === key)
}

function shareForTerritoryPlatform(platform: string, rates: ArtistShareRates): number {
  const name = platform.trim().toLowerCase()
  if (name.includes('bandcamp')) return clampSharePercent(rates.bandcampSplitPercentage)
  if (name.includes('darkmerch') || name.includes('dark merch')) {
    return clampSharePercent(rates.darkmerchSplitPercentage)
  }
  if (name.includes('shopify') || name.includes('printful') || name.includes('physical')) {
    return clampSharePercent(rates.physicalSplitPercentage)
  }
  if (name.length === 0) return clampSharePercent(rates.splitPercentage)
  return clampSharePercent(rates.believeSplitPercentage)
}

function shareForMerchSource(
  source: MerchOrderRow['source'],
  rates: ArtistShareRates,
): number {
  if (source === 'darkmerch') return clampSharePercent(rates.darkmerchSplitPercentage)
  return clampSharePercent(rates.physicalSplitPercentage)
}

function scaleEur(amount: number, percent: number): number {
  return amount * (percent / 100)
}

export function applyArtistShareToTerritoryMetrics(
  rows: TerritoryMetricRow[],
  rates: readonly ArtistShareRates[],
): TerritoryMetricRow[] {
  if (rows.length === 0 || rates.length === 0) return rows
  return rows.map((row) => {
    const artistRates = lookupRates(row.artistName, rates)
    if (!artistRates) return row
    const percent = shareForTerritoryPlatform(row.platform, artistRates)
    if (percent === 100) return row
    return { ...row, revenueEur: scaleEur(row.revenueEur, percent) }
  })
}

export function applyArtistShareToMerchOrders(
  rows: MerchOrderRow[],
  rates: readonly ArtistShareRates[],
): MerchOrderRow[] {
  if (rows.length === 0 || rates.length === 0) return rows
  return rows.map((row) => {
    const artistRates = lookupRates(row.artistName, rates)
    if (!artistRates) return row
    const percent = shareForMerchSource(row.source, artistRates)
    if (percent === 100) return row
    return { ...row, revenueEur: scaleEur(row.revenueEur, percent) }
  })
}
