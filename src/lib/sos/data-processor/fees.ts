import type { SalesTransaction } from '../ingest/csv-parser'
import { normalizeRevenueToEur } from '../currency'
import type { ReleaseSplitOverride, SplitFee, TransactionSource } from '../types'
import {
  buildCountryBreakdown,
  buildMonthlyBreakdown,
  buildPlatformBreakdown,
  buildReleaseBreakdown,
} from './breakdowns'
import type { DataProcessorConfig, ProcessedArtistData } from './types'

/** Constrains a split percentage to the valid 0–100 range. */
export function clampSplitPercentage(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function findReleaseOverride(
  overrides: ReleaseSplitOverride[],
  normalizedTitle: string,
): ReleaseSplitOverride | undefined {
  return overrides.find(o => normalizedTitle.includes(o.releaseTitle.toLowerCase()))
}

/** Resolves distribution fee as a decimal rate (0–1). */
export function resolveDistributionFeeRate(override: number | undefined, fallback: number): number {
  return (override != null ? override : fallback) / 100
}

export function resolveSplitPercentage(
  splitFee: { percentage: number; digitalPercentage?: number; physicalPercentage?: number } | undefined,
  typeOverride: 'digital' | 'physical',
  defaultBase: number = 100,
  defaultTypeOverride?: number,
): number {
  const perArtistTypeOverride = typeOverride === 'digital'
    ? splitFee?.digitalPercentage
    : splitFee?.physicalPercentage
  if (perArtistTypeOverride != null) return clampSplitPercentage(perArtistTypeOverride)
  if (defaultTypeOverride != null) return clampSplitPercentage(defaultTypeOverride)
  return clampSplitPercentage(splitFee?.percentage ?? defaultBase)
}

export function resolveSplitPercentageWithSourceOverride(
  splitFee: SplitFee | undefined,
  source: TransactionSource | null,
  isPhysical: boolean,
  defaultBase: number,
  defaultTypeOverride?: number,
  globalSourceSplits?: { believe?: number; bandcamp?: number; darkmerch?: number; physical?: number },
): number {
  if (source != null && splitFee?.sourceOverrides != null) {
    const sourceOverride = splitFee.sourceOverrides.find(o => o.source === source)
    if (sourceOverride != null) return clampSplitPercentage(sourceOverride.percentage)
  }
  if (splitFee != null) {
    return resolveSplitPercentage(splitFee, isPhysical ? 'physical' : 'digital', defaultBase, defaultTypeOverride)
  }
  if (source != null && globalSourceSplits != null) {
    let globalPct: number | undefined
    if (source === 'believe') globalPct = globalSourceSplits.believe
    else if (source === 'bandcamp') globalPct = globalSourceSplits.bandcamp
    else if (source === 'darkmerch') globalPct = globalSourceSplits.darkmerch
    else if (source === 'shopify' || source === 'printful') globalPct = globalSourceSplits.physical
    if (globalPct != null) return clampSplitPercentage(globalPct)
  }
  const effectiveDefault = defaultTypeOverride ?? defaultBase
  return clampSplitPercentage(effectiveDefault)
}

export interface BuildProcessedArtistInput {
  lowerKey: string
  artist: string
  artistTransactions: SalesTransaction[]
  config: DataProcessorConfig
}

/**
 * Computes EUR-normalised revenue, fees, splits, and payout for one artist group.
 */
export function buildProcessedArtistData({
  lowerKey,
  artist,
  artistTransactions,
  config,
}: BuildProcessedArtistInput): ProcessedArtistData {
  let digitalRevenue = 0
  let physicalRevenue = 0
  let totalQuantity = 0
  let believeDigitalRevenue = 0
  let bandcampDigitalRevenue = 0
  let otherDigitalRevenue = 0

  const rates = config.exchangeRates ?? {}
  const historicalRates = config.historicalExchangeRates ?? {}

  const eurTransactions = artistTransactions.map(t => ({
    ...t,
    net_revenue: normalizeRevenueToEur(
      t.net_revenue,
      t.currency,
      t.sales_month,
      rates,
      historicalRates,
    ),
  }))

  for (const t of eurTransactions) {
    totalQuantity += t.quantity
    if (t.is_physical) {
      physicalRevenue += t.net_revenue
    } else {
      digitalRevenue += t.net_revenue
      if (t.source === 'believe') {
        believeDigitalRevenue += t.net_revenue
      } else if (t.source === 'bandcamp') {
        bandcampDigitalRevenue += t.net_revenue
      } else {
        otherDigitalRevenue += t.net_revenue
      }
    }
  }

  const totalDownloadRevenue = eurTransactions
    .filter(t => !t.is_physical && t.is_download === true)
    .reduce((s, t) => s + t.net_revenue, 0)
  const totalStreamRevenue = eurTransactions
    .filter(t => !t.is_physical && t.is_download === false)
    .reduce((s, t) => s + t.net_revenue, 0)

  const believeRevenue = eurTransactions
    .filter(t => t.source === 'believe')
    .reduce((s, t) => s + t.net_revenue, 0)
  const bandcampRevenue = eurTransactions
    .filter(t => t.source === 'bandcamp')
    .reduce((s, t) => s + t.net_revenue, 0)
  const darkmerchRevenue = eurTransactions
    .filter(t => t.source === 'darkmerch')
    .reduce((s, t) => s + t.net_revenue, 0)

  const artistManualRevenues = config.manualRevenues.filter(mr => mr.artist.toLowerCase() === lowerKey)
  const manualRevenue = artistManualRevenues.reduce((sum, mr) => sum + mr.amount, 0)
  const manualRevenueEntries = artistManualRevenues.map(mr => ({ description: mr.description, amount: mr.amount }))

  const artistExpenses = (config.expenses ?? []).filter(e => e.artist.toLowerCase() === lowerKey)
  const totalExpenses = artistExpenses.reduce((sum, e) => sum + e.amount, 0)
  const expenseEntries = artistExpenses.map(e => ({ description: e.description, amount: e.amount, date: e.date }))

  const globalFeeDefault = config.distributionFeePercentage ?? 0
  const digitalFeeRate = resolveDistributionFeeRate(config.distributionFeeDigital, globalFeeDefault)
  const physicalFeeRate = resolveDistributionFeeRate(config.distributionFeePhysical, globalFeeDefault)

  const darkmerchTxRevenue = eurTransactions
    .filter(t => t.source === 'darkmerch')
    .reduce((s, t) => s + t.net_revenue, 0)
  const physicalReleasesRevenue = physicalRevenue - darkmerchTxRevenue

  const digitalFeeDeducted = digitalRevenue * digitalFeeRate
  const physicalReleasesFeeDeducted = physicalReleasesRevenue * physicalFeeRate
  const darkmerchFeeDeducted = darkmerchTxRevenue * physicalFeeRate
  const distributionFeeDeducted = digitalFeeDeducted + physicalReleasesFeeDeducted + darkmerchFeeDeducted

  const digitalAfterFee = digitalRevenue - digitalFeeDeducted
  const believeDigitalAfterFee = believeDigitalRevenue - believeDigitalRevenue * digitalFeeRate
  const bandcampDigitalAfterFee = bandcampDigitalRevenue - bandcampDigitalRevenue * digitalFeeRate
  const otherDigitalAfterFee = otherDigitalRevenue - otherDigitalRevenue * digitalFeeRate
  const physicalReleasesAfterFee = physicalReleasesRevenue - physicalReleasesFeeDeducted
  const darkmerchAfterFee = darkmerchTxRevenue - darkmerchFeeDeducted

  const grossRevenue = digitalRevenue + physicalRevenue + manualRevenue

  const defaultBase = config.defaultSplitPercentage ?? 100
  const splitFee = config.splitFees.find(sf => sf.artist.toLowerCase() === lowerKey)

  const mainChainDigitalSplitPct = resolveSplitPercentageWithSourceOverride(
    splitFee, null, false, defaultBase, config.defaultSplitPercentageDigital,
  )

  const believeSourceOverride = splitFee?.sourceOverrides?.find(o => o.source === 'believe')
  const believeSplitPct = believeSourceOverride != null
    ? clampSplitPercentage(believeSourceOverride.percentage)
    : config.sourceSplits?.believe != null
      ? clampSplitPercentage(config.sourceSplits.believe)
      : mainChainDigitalSplitPct

  const bandcampSourceOverride = splitFee?.sourceOverrides?.find(o => o.source === 'bandcamp')
  const bandcampSplitPct = bandcampSourceOverride != null
    ? clampSplitPercentage(bandcampSourceOverride.percentage)
    : config.sourceSplits?.bandcamp != null
      ? clampSplitPercentage(config.sourceSplits.bandcamp)
      : mainChainDigitalSplitPct

  const otherDigitalSplitPct = mainChainDigitalSplitPct

  const digitalSplitPct = config.sourceSplits?.believe != null
    ? believeSplitPct
    : config.sourceSplits?.bandcamp != null
      ? bandcampSplitPct
      : otherDigitalSplitPct

  const physicalBucketPerArtistOverride = splitFee?.sourceOverrides?.find(
    o => o.source === 'shopify' || o.source === 'printful',
  )
  const physicalSplitPct = (() => {
    if (physicalBucketPerArtistOverride != null) {
      return clampSplitPercentage(physicalBucketPerArtistOverride.percentage)
    }
    if (splitFee?.physicalPercentage != null) {
      return clampSplitPercentage(splitFee.physicalPercentage)
    }
    if (config.sourceSplits?.physical != null) {
      return clampSplitPercentage(config.sourceSplits.physical)
    }
    return resolveSplitPercentageWithSourceOverride(
      splitFee, null, true, defaultBase, config.defaultSplitPercentagePhysical,
    )
  })()

  const darkmerchPerArtistOverride = splitFee?.sourceOverrides?.find(o => o.source === 'darkmerch')
  const darkmerchSplitPct = config.sourceSplits?.darkmerch != null
    ? clampSplitPercentage(darkmerchPerArtistOverride?.percentage ?? config.sourceSplits.darkmerch)
    : resolveSplitPercentageWithSourceOverride(
        splitFee, 'darkmerch', true, defaultBase, config.defaultSplitPercentagePhysical, config.sourceSplits,
      )

  const splitPercentage = (physicalReleasesRevenue === 0 && darkmerchTxRevenue === 0)
    ? digitalSplitPct
    : clampSplitPercentage(splitFee?.percentage ?? defaultBase)

  let finalPayout: number

  const releaseOverrides = splitFee?.releaseOverrides
  if (releaseOverrides != null && releaseOverrides.length > 0) {
    const releaseGroups = new Map<string, SalesTransaction[]>()
    for (const t of eurTransactions) {
      const key = (t.release_title || 'Unknown').toLowerCase()
      const group = releaseGroups.get(key)
      if (group) {
        group.push(t)
      } else {
        releaseGroups.set(key, [t])
      }
    }

    let perReleasePayout = 0
    for (const [releaseKey, releaseTxs] of releaseGroups.entries()) {
      let releaseBelieveDigital = 0
      let releaseBandcampDigital = 0
      let releaseOtherDigital = 0
      let releasePhysicalReleases = 0
      let releaseDarkmerch = 0
      for (const t of releaseTxs) {
        if (t.source === 'darkmerch') {
          releaseDarkmerch += t.net_revenue
        } else if (t.is_physical) {
          releasePhysicalReleases += t.net_revenue
        } else if (t.source === 'believe') {
          releaseBelieveDigital += t.net_revenue
        } else if (t.source === 'bandcamp') {
          releaseBandcampDigital += t.net_revenue
        } else {
          releaseOtherDigital += t.net_revenue
        }
      }

      const releaseBelieveDigitalAfterFee = releaseBelieveDigital - releaseBelieveDigital * digitalFeeRate
      const releaseBandcampDigitalAfterFee = releaseBandcampDigital - releaseBandcampDigital * digitalFeeRate
      const releaseOtherDigitalAfterFee = releaseOtherDigital - releaseOtherDigital * digitalFeeRate
      const releasePhysicalAfterFee = releasePhysicalReleases - releasePhysicalReleases * physicalFeeRate
      const releaseDarkmerchAfterFee = releaseDarkmerch - releaseDarkmerch * physicalFeeRate

      const matchedOverride = findReleaseOverride(releaseOverrides, releaseKey)

      const effectiveBelievePct = matchedOverride != null
        ? clampSplitPercentage(matchedOverride.percentage)
        : believeSplitPct
      const effectiveBandcampPct = matchedOverride != null
        ? clampSplitPercentage(matchedOverride.percentage)
        : bandcampSplitPct
      const effectiveOtherDigitalPct = matchedOverride != null
        ? clampSplitPercentage(matchedOverride.percentage)
        : otherDigitalSplitPct
      const effectivePhysicalPct = matchedOverride != null
        ? clampSplitPercentage(matchedOverride.physicalPercentage ?? matchedOverride.percentage)
        : physicalSplitPct
      const effectiveDarkmerchPct = matchedOverride != null
        ? clampSplitPercentage(matchedOverride.physicalPercentage ?? matchedOverride.percentage)
        : darkmerchSplitPct

      perReleasePayout +=
        releaseBelieveDigitalAfterFee * (effectiveBelievePct / 100) +
        releaseBandcampDigitalAfterFee * (effectiveBandcampPct / 100) +
        releaseOtherDigitalAfterFee * (effectiveOtherDigitalPct / 100) +
        releasePhysicalAfterFee * (effectivePhysicalPct / 100) +
        releaseDarkmerchAfterFee * (effectiveDarkmerchPct / 100)
    }

    finalPayout = perReleasePayout - totalExpenses + manualRevenue
  } else {
    finalPayout =
      believeDigitalAfterFee * (believeSplitPct / 100) +
        bandcampDigitalAfterFee * (bandcampSplitPct / 100) +
        otherDigitalAfterFee * (otherDigitalSplitPct / 100) +
        physicalReleasesAfterFee * (physicalSplitPct / 100) +
        darkmerchAfterFee * (darkmerchSplitPct / 100) -
        totalExpenses +
        manualRevenue
  }

  const openingBalanceEur = config.carryForwardByArtist?.[lowerKey] ?? 0
  const amountDueEur = finalPayout + openingBalanceEur

  return {
    artist,
    transactions: artistTransactions,
    believeRevenue,
    bandcampRevenue,
    darkmerchRevenue,
    totalDigitalRevenue: digitalRevenue,
    totalPhysicalRevenue: physicalRevenue,
    totalDownloadRevenue,
    totalStreamRevenue,
    manualRevenue,
    manualRevenueEntries,
    grossRevenue,
    splitPercentage,
    finalPayout,
    openingBalanceEur,
    amountDueEur,
    totalQuantity,
    totalExpenses,
    expenseEntries,
    distributionFeeDeducted,
    physicalReleasesRevenue,
    digitalRevenueAfterFee: digitalAfterFee,
    believeDigitalRevenueAfterFee: believeDigitalAfterFee,
    bandcampDigitalRevenueAfterFee: bandcampDigitalAfterFee,
    otherDigitalRevenueAfterFee: otherDigitalAfterFee,
    physicalReleasesRevenueAfterFee: physicalReleasesAfterFee,
    darkmerchRevenueAfterFee: darkmerchAfterFee,
    digitalSplitPercentage: digitalSplitPct,
    believeSplitPercentage: believeSplitPct,
    bandcampSplitPercentage: bandcampSplitPct,
    physicalSplitPercentage: physicalSplitPct,
    darkmerchSplitPercentage: darkmerchSplitPct,
    platformBreakdown: buildPlatformBreakdown(eurTransactions),
    countryBreakdown: buildCountryBreakdown(eurTransactions),
    monthlyBreakdown: buildMonthlyBreakdown(eurTransactions),
    releaseBreakdown: buildReleaseBreakdown(eurTransactions),
  }
}