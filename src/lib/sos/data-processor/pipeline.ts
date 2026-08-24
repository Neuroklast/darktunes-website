import type { SalesTransaction } from '../ingest/csv-parser'
import {
  applyIgnoredEntriesFilter,
  applyLabelRosterFilter,
  applyTrackRevenueAssignments,
  buildFilteredCompilations,
  groupTransactionsByArtist,
  isCompilation,
  resolveMainArtist,
} from './distribution'
import { buildProcessedArtistData } from './fees'
import type { DataProcessorConfig, ProcessedArtistData, ProcessorResult } from './types'

/**
 * Runs the full SOS royalty pipeline and returns per-artist processed data.
 */
export function processTransactions(
  transactions: SalesTransaction[],
  config: DataProcessorConfig,
): ProcessedArtistData[] {
  return processTransactionsWithCompilations(transactions, config).artistData
}

/**
 * Runs the SOS pipeline and includes informational compilation summaries.
 */
export function processTransactionsWithCompilations(
  transactions: SalesTransaction[],
  config: DataProcessorConfig,
): ProcessorResult {
  const compilationTransactionIds = new Set<string>()
  for (const t of transactions) {
    if (isCompilation(t, config.compilationFilters)) {
      compilationTransactionIds.add(t.id)
    }
  }

  const filteredCompilations = buildFilteredCompilations(
    transactions,
    compilationTransactionIds,
    config.compilationFilters,
    config.exchangeRates ?? {},
    config.historicalExchangeRates ?? {},
  )

  const workingTransactions = config.excludePhysical
    ? transactions.filter(t => !t.is_physical)
    : transactions

  const resolved = workingTransactions.map(t => ({
    ...t,
    main_artist: resolveMainArtist(t.original_artist, config.artistMappings),
  }))

  const assigned = applyTrackRevenueAssignments(
    resolved,
    config.trackRevenueAssignments ?? [],
  )

  const rosterFiltered = applyLabelRosterFilter(assigned, config.labelArtists)

  const rosterAndIgnoreFiltered = applyIgnoredEntriesFilter(
    rosterFiltered,
    config.ignoredEntries ?? [],
  )

  const { groups: artistGroups, canonicalNames: canonicalArtistNames } =
    groupTransactionsByArtist(rosterAndIgnoreFiltered)

  const artistData: ProcessedArtistData[] = []

  for (const [lowerKey, artistTransactions] of artistGroups.entries()) {
    const artist = canonicalArtistNames.get(lowerKey) ?? lowerKey
    artistData.push(
      buildProcessedArtistData({
        lowerKey,
        artist,
        artistTransactions,
        config,
      }),
    )
  }

  artistData.sort((a, b) => b.finalPayout - a.finalPayout)

  return { artistData, filteredCompilations }
}