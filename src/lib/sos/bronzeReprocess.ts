/**
 * Server-side Bronze CSV re-processing: R2 → parse → full SOS pipeline → territory metrics.
 */

import type { SalesTransaction } from './ingest/csv-parser'
import { parseCSVContentStreaming } from './ingest/streaming-csv-parser'
import { parseShopifyCSV } from './ingest/shopify-parser'
import { parseDarkmerchCSV } from './ingest/darkmerch-parser'
import {
  aggregateTerritoryMetrics,
  processTransactionsWithCompilations,
  type TerritoryMetricRow,
} from './data-processor'
import type { DataProcessorConfig } from './data-processor/types'
import { normalizeAccountingConfig, type SosAccountingSettings } from './sosAccountingSettings'
import type { BronzeDistributor } from './bronzeUpload'
import type { LabelArtist } from './types'
import type { ExchangeRates, HistoricalRates } from './currency'

async function parseBronzeCsvContent(
  distributor: BronzeDistributor,
  csvContent: string,
): Promise<SalesTransaction[]> {
  if (distributor === 'shopify') {
    return parseShopifyCSV(csvContent).transactions
  }
  if (distributor === 'printful') {
    return []
  }
  if (distributor === 'darkmerch') {
    return parseDarkmerchCSV(csvContent).transactions
  }
  const result = await parseCSVContentStreaming(
    csvContent,
    distributor === 'bandcamp' ? 'bandcamp' : 'believe',
  )
  return result.transactions
}

export interface BronzeReprocessOptions {
  workspaceConfig?: Partial<SosAccountingSettings>
  labelArtists?: LabelArtist[]
  exchangeRates?: ExchangeRates
  historicalExchangeRates?: HistoricalRates
  carryForwardByArtist?: Record<string, number>
}

export interface BronzeReprocessResult {
  rowCount: number
  territoryMetrics: TerritoryMetricRow[]
  uniqueArtists: string[]
}

export function buildReprocessConfig(options: BronzeReprocessOptions): DataProcessorConfig {
  const normalized = normalizeAccountingConfig(options.workspaceConfig)

  return {
    compilationFilters: normalized.compilationFilters,
    artistMappings: normalized.artistMappings,
    splitFees: normalized.splitFees,
    manualRevenues: normalized.manualRevenues,
    expenses: normalized.expenses,
    ignoredEntries: normalized.ignoredEntries,
    trackRevenueAssignments: normalized.trackRevenueAssignments,
    labelArtists: options.labelArtists,
    distributionFeePercentage: normalized.appDefaults.distributionFeePercentage,
    distributionFeeDigital: normalized.appDefaults.distributionFeeDigital,
    distributionFeePhysical: normalized.appDefaults.distributionFeePhysical,
    defaultSplitPercentage: normalized.appDefaults.defaultSplitPercentage,
    defaultSplitPercentageDigital: normalized.appDefaults.defaultSplitPercentageDigital,
    defaultSplitPercentagePhysical: normalized.appDefaults.defaultSplitPercentagePhysical,
    sourceSplits: normalized.appDefaults.sourceSplits,
    exchangeRates: options.exchangeRates,
    historicalExchangeRates: options.historicalExchangeRates,
    carryForwardByArtist: options.carryForwardByArtist,
  }
}

/**
 * Parses archived Bronze CSV text and produces gold-layer territory metrics
 * using the same pipeline as the browser worker.
 */
export async function reprocessBronzeCsvContent(
  distributor: BronzeDistributor,
  csvContent: string,
  options: BronzeReprocessOptions = {},
): Promise<BronzeReprocessResult> {
  const transactions = await parseBronzeCsvContent(distributor, csvContent)
  const config = buildReprocessConfig(options)
  const { artistData } = processTransactionsWithCompilations(transactions, config)
  const territoryMetrics = aggregateTerritoryMetrics(artistData)

  return {
    rowCount: transactions.length,
    territoryMetrics,
    uniqueArtists: artistData.map((a) => a.artist).sort(),
  }
}