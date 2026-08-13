import type { SalesTransaction } from '../ingest/csv-parser'
import { normalizeRevenueToEur, type ExchangeRates, type HistoricalRates } from '../currency'
import {
  ownerPercentagesSumTo100,
  resolveAssignmentOwners,
  splitRevenueAmongOwners,
} from '@/lib/sos/trackAssignmentSplits'
import type {
  ArtistMapping,
  CompilationFilter,
  FilteredCompilation,
  IgnoredEntry,
  LabelArtist,
  TrackRevenueAssignment,
} from '../types'

/**
 * Returns whether a transaction matches any compilation filter rule.
 */
export function isCompilation(
  transaction: SalesTransaction,
  filters: CompilationFilter[],
): boolean {
  for (const filter of filters) {
    switch (filter.type) {
      case 'ean':
        if (
          transaction.upc_ean &&
          transaction.upc_ean.toLowerCase() === filter.identifier.toLowerCase()
        ) {
          return true
        }
        break
      case 'catalog':
        if (
          transaction.catalog_number &&
          transaction.catalog_number.toLowerCase() === filter.identifier.toLowerCase()
        ) {
          return true
        }
        break
      case 'title':
        if (transaction.release_title?.toLowerCase().includes(filter.identifier.toLowerCase())) {
          return true
        }
        break
    }
  }
  return false
}

/**
 * Maps featuring/co-artist names to the roster primary artist via configured aliases.
 */
export function resolveMainArtist(
  originalArtist: string,
  mappings: ArtistMapping[],
): string {
  if (!originalArtist) return ''
  const lower = originalArtist.toLowerCase()
  const mapping = mappings.find(m => m.featuringName.toLowerCase() === lower)
  return mapping ? mapping.primaryArtist : originalArtist
}

/**
 * Builds the informational compilation summary panel (compilations still count toward revenue).
 */
export function buildFilteredCompilations(
  transactions: SalesTransaction[],
  compilationTransactionIds: Set<string>,
  compilationFilters: CompilationFilter[],
  exchangeRates: ExchangeRates = {},
  historicalRates: HistoricalRates = {},
): FilteredCompilation[] {
  const compilationMap = new Map<string, FilteredCompilation>()
  for (const t of transactions) {
    if (!compilationTransactionIds.has(t.id)) continue

    const matchingFilter = compilationFilters.find(f => {
      switch (f.type) {
        case 'ean':
          return t.upc_ean?.toLowerCase() === f.identifier.toLowerCase()
        case 'catalog':
          return t.catalog_number?.toLowerCase() === f.identifier.toLowerCase()
        case 'title':
          return t.release_title?.toLowerCase().includes(f.identifier.toLowerCase())
        default:
          return false
      }
    })
    if (!matchingFilter) continue

    const key = matchingFilter.id
    const revenueEur = normalizeRevenueToEur(
      t.net_revenue,
      t.currency,
      t.sales_month,
      exchangeRates,
      historicalRates,
    )
    const existing = compilationMap.get(key)
    if (existing) {
      existing.revenue += revenueEur
      existing.transactionCount += 1
    } else {
      compilationMap.set(key, {
        releaseTitle: t.release_title || matchingFilter.identifier,
        identifier: matchingFilter.identifier,
        filterType: matchingFilter.type,
        revenue: revenueEur,
        transactionCount: 1,
      })
    }
  }

  return Array.from(compilationMap.values()).sort((a, b) => b.revenue - a.revenue)
}

type ResolvedTransaction = SalesTransaction & { main_artist: string }

/**
 * Applies track revenue assignment rules (multi-owner splits clone transactions).
 */
export function applyTrackRevenueAssignments(
  resolved: ResolvedTransaction[],
  trackAssignments: TrackRevenueAssignment[],
): ResolvedTransaction[] {
  if (trackAssignments.length === 0) return resolved

  return resolved.flatMap(t => {
    const relLower = (t.release_title ?? '').toLowerCase()
    const trkLower = (t.track_title ?? '').toLowerCase()
    const match = trackAssignments.find(
      a =>
        a.trackTitle.trim() !== '' &&
        (relLower.includes(a.trackTitle.trim().toLowerCase()) ||
          trkLower.includes(a.trackTitle.trim().toLowerCase())),
    )

    if (!match) return [t]

    const owners = resolveAssignmentOwners(match)
    if (owners.length === 0) return [t]

    const ownersForSum = owners.map((owner) => ({ percentage: owner.fraction * 100 }))
    if (!ownerPercentagesSumTo100(ownersForSum)) {
      return [t]
    }

    if (owners.length === 1 && owners[0].fraction === 1) {
      return [{ ...t, main_artist: owners[0].artist }]
    }

    const revenueByOwner = splitRevenueAmongOwners(t.net_revenue, owners)
    let allocatedQty = 0
    return owners.map((owner, index) => {
      const isLast = index === owners.length - 1
      const quantity = isLast
        ? t.quantity - allocatedQty
        : Math.round(t.quantity * owner.fraction)
      if (!isLast) allocatedQty += quantity
      return {
        ...t,
        id: `${t.id}__split__${owner.artist}`,
        main_artist: owner.artist,
        net_revenue: revenueByOwner.get(owner.artist.trim()) ?? 0,
        quantity,
      }
    })
  })
}

/**
 * Restricts transactions to the label artist roster and re-attributes co-billed names.
 */
export function applyLabelRosterFilter(
  assigned: ResolvedTransaction[],
  labelArtists: LabelArtist[] | undefined,
): ResolvedTransaction[] {
  const rosterNames =
    labelArtists && labelArtists.length > 0
      ? labelArtists.map(la => la.name.trim().toLowerCase())
      : null

  if (!rosterNames) return assigned

  return assigned.flatMap(t => {
    if (rosterNames.includes(t.main_artist.trim().toLowerCase())) {
      return [t]
    }

    const found = rosterNames.find(rn =>
      t.original_artist.trim().toLowerCase() === rn ||
      t.original_artist.toLowerCase().split(/\s*[,&]\s*|\s+feat(?:uring)?\.?\s+|\s+ft\.?\s+/i).some(
        part => part.trim().toLowerCase() === rn,
      ),
    )
    if (!found) return []

    const canonical =
      labelArtists?.find(la => la.name.trim().toLowerCase() === found)?.name ?? found
    return [{ ...t, main_artist: canonical }]
  })
}

/**
 * Drops transactions matching ignored artist/release rules.
 */
export function applyIgnoredEntriesFilter(
  rosterFiltered: ResolvedTransaction[],
  ignoredEntries: IgnoredEntry[],
): ResolvedTransaction[] {
  if (ignoredEntries.length === 0) return rosterFiltered

  return rosterFiltered.filter(t => {
    const artistLower = t.main_artist.trim().toLowerCase()
    return !ignoredEntries.some(ie => {
      if (ie.artist.trim().toLowerCase() !== artistLower) return false
      if (!ie.releaseTitle) return true
      return t.release_title?.trim().toLowerCase() === ie.releaseTitle.trim().toLowerCase()
    })
  })
}

/**
 * Groups transactions by resolved artist name (case-insensitive key, canonical casing preserved).
 */
export function groupTransactionsByArtist(
  transactions: ResolvedTransaction[],
): { groups: Map<string, SalesTransaction[]>; canonicalNames: Map<string, string> } {
  const artistGroups = new Map<string, SalesTransaction[]>()
  const canonicalArtistNames = new Map<string, string>()

  for (const t of transactions) {
    const key = t.main_artist.toLowerCase()
    if (!canonicalArtistNames.has(key)) {
      canonicalArtistNames.set(key, t.main_artist)
    }
    const group = artistGroups.get(key)
    if (group) {
      group.push(t)
    } else {
      artistGroups.set(key, [t])
    }
  }

  return { groups: artistGroups, canonicalNames: canonicalArtistNames }
}

/**
 * Returns unique resolved artist names from raw transactions.
 */
export function getUniqueArtistsFromTransactions(
  transactions: SalesTransaction[],
  mappings: ArtistMapping[],
): string[] {
  const artistSet = new Set<string>()
  for (const t of transactions) {
    artistSet.add(resolveMainArtist(t.original_artist, mappings))
  }
  return Array.from(artistSet).sort()
}

/**
 * Extracts the main artist and guest artists from a title/artist string.
 */
export function extractCollabs(title: string): { mainArtist: string; guestArtists: string[] } {
  if (!title || !title.trim()) return { mainArtist: '', guestArtists: [] }

  const featRegex = /\s*[[(]?\s*(?:feat(?:uring)?\.?|ft\.?)\s*/gi
  const versusRegex = /\s+(?:versus|vs\.?)\s+/gi

  const featParts = title.split(featRegex).map(p => p.replace(/[\])\s]+$/, '').trim()).filter(Boolean)
  if (featParts.length > 1) {
    const mainArtist = featParts[0]
    const guestArtists = featParts.slice(1).flatMap(p =>
      p.split(/\s*[,&]\s*|\s+and\s+/gi).map(a => a.trim()).filter(Boolean),
    )
    return { mainArtist, guestArtists }
  }

  const versusParts = title.split(versusRegex).map(p => p.trim()).filter(Boolean)
  if (versusParts.length > 1) {
    return { mainArtist: versusParts[0], guestArtists: versusParts.slice(1) }
  }

  return { mainArtist: title.trim(), guestArtists: [] }
}