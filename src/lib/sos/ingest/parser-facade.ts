/**
 * parser-facade.ts
 *
 * Unified entry point for all CSV parsing in the ingest feature.
 *
 * The facade implements a two-phase strategy:
 *  1. Profile-based detection — scans the CSV header against every
 *     CsvImportProfile supplied by the caller and selects the best match.
 *  2. Legacy fallback — if no profile matches, the original column-scoring
 *     heuristic is applied so existing files keep working without any profile
 *     configuration.
 *
 * After detection, routing is determined by the matched profile's `type`:
 *  - 'financial'   → SalesTransaction[] (revenue / transaction store)
 *  - 'master-data' → LabelArtist[]      (artist roster store)
 */
import type { SalesTransaction } from './csv-parser'
import { fingerprintHeaders } from './importSample'
import { parseCSVLine } from './csv-parser'
import { parseCSVContentStreaming } from './streaming-csv-parser'
import type { StreamingParseResult } from './streaming-csv-parser'
import type { CsvImportProfile, FinancialFieldKey } from './types'
import {
  FINANCIAL_KEY_TO_INTERNAL,
  SYSTEM_BANDCAMP_PROFILE_ID,
  SYSTEM_BANDCAMP_DDS_PROFILE_ID,
  SYSTEM_SHOPIFY_PROFILE_ID,
  SYSTEM_PRINTFUL_PROFILE_ID,
  SYSTEM_DARKMERCH_PROFILE_ID,
} from './default-profiles'
import {
  parseShopifyRaw,
  reconcileMerchTransactions,
} from './ecommerce-merger'
import type { ShopifyRawOrder, PrintfulRawCost } from './ecommerce-merger'
import { parsePrintfulCSV } from './printful-parser'
import type { LabelArtist } from '../types'
import { resolveProfileColumnsAgainstHeaders } from './columnMappingSuggestions'

export type FileType = 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'master-data' | 'unknown'

export interface ParseFileResult {
  fileType: FileType
  /** ID of the matched CsvImportProfile, if any. */
  profileId?: string
  /** Type of the matched profile, drives downstream routing. */
  profileType?: 'financial' | 'master-data'
  /**
   * Final SalesTransaction records — empty for raw e-commerce buffer files.
   * E-commerce files return their raw data in shopifyRawOrders / printfulRawCosts.
   */
  transactions: SalesTransaction[]
  /** Populated when profileType === 'master-data'. */
  labelArtists?: Array<Omit<LabelArtist, 'id'>>
  /**
   * Raw Shopify orders staging buffer.
   * Populated instead of `transactions` when a Shopify profile is matched.
   * Callers must pass this to `reconcileMerchTransactions` together with any
   * available `printfulRawCosts` to produce the final SalesTransactions.
   */
  shopifyRawOrders?: ShopifyRawOrder[]
  /**
   * Raw Printful cost staging buffer.
   * Populated instead of `transactions` when a Printful profile is matched.
   */
  printfulRawCosts?: PrintfulRawCost[]
  errors: Array<{ row: number; reason: string; data: string }>
  uniqueArtists: string[]
}

// ── Header normalisation helpers ──────────────────────────────────────────────

/** Strips quotes and whitespace from a CSV header token for comparison. */
function normalizeHeader(h: string): string {
  return h.replace(/['"]/g, '').trim().toLowerCase()
}

/**
 * Parses the header line into individual column tokens.
 * Handles comma-, semicolon-, and tab-delimited headers.
 */
function splitHeader(headerLine: string): string[] {
  let delimiter: string
  if (headerLine.includes('\t')) {
    delimiter = '\t'
  } else if (headerLine.includes(';')) {
    delimiter = ';'
  } else {
    delimiter = ','
  }
  return headerLine.split(delimiter).map(normalizeHeader)
}

/** Counts how many of the given candidate column names are present in the headers. */
function countMatches(headers: string[], candidates: string[]): number {
  return candidates.filter(c => headers.includes(c)).length
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Strips BOM and normalises line endings to `\n` in raw CSV content.
 * Applied once before any line-based processing to ensure consistent behaviour
 * across UTF-8, UTF-16 LE/BE, and Windows CRLF files.
 */
function normaliseCsvContent(content: string): string {
  return content
    .replace(/^\uFEFF/, '')   // strip BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

// ── Profile matching ──────────────────────────────────────────────────────────

/**
 * Finds the best-matching CsvImportProfile for the given CSV header tokens.
 *
 * Scoring: the profile whose `autoDetectHeaders` achieves the highest ratio
 * of matched vs. required columns wins. A minimum of 2 matches (or all
 * required columns, whichever is smaller) is required to prevent false
 * positives on very short autoDetectHeaders lists.
 *
 * @param headers - Raw (un-normalised) CSV header column names.
 * @param profiles - Candidate profiles to test against.
 * @returns The best-matching profile, or `null` if no profile matches.
 */
export function matchProfile(
  headers: string[],
  profiles: CsvImportProfile[]
): CsvImportProfile | null {
  const normalized = headers.map(h => h.toLowerCase().trim())
  const signature = fingerprintHeaders(headers)
  // A user-confirmed schema is authoritative; do not let a broad system
  // heuristic misclassify an identical file and override its mapping.
  const exact = profiles.find((profile) =>
    profile.type === 'financial' &&
    profile.headerFingerprint === signature &&
    signature.length > 0,
  )
  if (exact) return exact

  let bestProfile: CsvImportProfile | null = null
  let bestScore = 0

  for (const profile of profiles) {
    const required = profile.autoDetectHeaders.map(h => h.toLowerCase().trim())
    if (required.length === 0) continue

    const matches = required.filter((h) =>
      normalized.some((col) => col === h || col.includes(h) || h.includes(col)),
    ).length
    const minRequired = Math.min(2, required.length)

    if (matches < minRequired) continue

    const score = matches / required.length
    if (score > bestScore) {
      bestScore = score
      bestProfile = profile
    }
  }

  return bestProfile
}

// ── Column mapping helpers ────────────────────────────────────────────────────

/**
 * Converts a profile's `columnMapping` into the inverted format expected by
 * the streaming CSV parser: `{ csvColumnName → internalFieldName }`.
 *
 * Only financial field keys are translated; master-data keys are ignored here.
 *
 * @param profile - A CsvImportProfile with a financial columnMapping.
 * @returns Inverted mapping suitable for `parseCSVContentStreaming`'s
 *   `columnMapping` parameter.
 */
export function buildStreamingColumnMapping(
  profile: CsvImportProfile,
  headers?: string[],
): Record<string, string> {
  const resolved = headers
    ? resolveProfileColumnsAgainstHeaders(profile.columnMapping, headers)
    : profile.columnMapping

  const result: Record<string, string> = {}

  for (const [profileKey, csvColumn] of Object.entries(resolved)) {
    if (!csvColumn) continue
    const internalKey = FINANCIAL_KEY_TO_INTERNAL[profileKey as FinancialFieldKey]
    if (internalKey) {
      result[csvColumn] = internalKey
    }
  }

  return result
}

// ── Master-data CSV parser ────────────────────────────────────────────────────

/**
 * Parses a master-data CSV (artist roster) guided by a CsvImportProfile.
 *
 * The function reads the header row to find column indices for each
 * MasterDataFieldKey, then maps every subsequent row to a partial
 * LabelArtist object. Rows with an empty name column are silently skipped.
 *
 * @param content - Raw CSV file content as a string.
 * @param profile - A master-data profile providing the column mapping.
 * @returns Array of partial LabelArtist objects ready for roster import.
 */
export function parseMasterDataCSV(
  content: string,
  profile: CsvImportProfile
): Array<Omit<LabelArtist, 'id'>> {
  const lines = normaliseCsvContent(content).split('\n')

  const firstNonEmpty = lines.findIndex(l => l.trim().length > 0)
  if (firstNonEmpty === -1) return []

  const delimiter = profile.delimiter
  const headerLine = lines[firstNonEmpty]
  const headers = parseCSVLine(headerLine, delimiter).map(h => h.trim().toLowerCase())

  // Build a lookup: master-data field → column index
  const { columnMapping } = profile
  const nameIdx          = headers.indexOf((columnMapping.name ?? 'name').toLowerCase())
  const emailIdx         = headers.indexOf((columnMapping.email ?? 'email').toLowerCase())
  const vatNumberIdx     = headers.indexOf((columnMapping.vatNumber ?? 'vatnumber').toLowerCase())
  const isEuNonGermanIdx = headers.indexOf((columnMapping.isEuNonGerman ?? 'iseunongerman').toLowerCase())
  const notesIdx         = headers.indexOf((columnMapping.notes ?? 'notes').toLowerCase())
  const accountHolderIdx = headers.indexOf((columnMapping.accountHolder ?? 'accountholder').toLowerCase())
  const ibanIdx          = headers.indexOf((columnMapping.iban ?? 'iban').toLowerCase())
  const bicIdx           = headers.indexOf((columnMapping.bic ?? 'bic').toLowerCase())

  const dataLines = lines.slice(firstNonEmpty + 1)
  const result: Array<Omit<LabelArtist, 'id'>> = []

  for (const line of dataLines) {
    if (!line.trim()) continue
    const cols = parseCSVLine(line, delimiter)
    const name = nameIdx >= 0 ? (cols[nameIdx] ?? '').trim() : ''
    if (!name) continue

    const rawIban = ibanIdx >= 0 ? (cols[ibanIdx] ?? '').trim() : ''
    // Normalise IBAN: remove spaces and dashes, force uppercase
    const normalisedIban = rawIban.replace(/[\s-]/g, '').toUpperCase() || undefined

    result.push({
      name,
      email:         emailIdx >= 0         ? (cols[emailIdx] ?? '').trim() || undefined         : undefined,
      vatNumber:     vatNumberIdx >= 0      ? (cols[vatNumberIdx] ?? '').trim() || undefined      : undefined,
      isEuNonGerman: isEuNonGermanIdx >= 0  ? (cols[isEuNonGermanIdx] ?? '').trim().toLowerCase() === 'true' : undefined,
      notes:         notesIdx >= 0          ? (cols[notesIdx] ?? '').trim() || undefined          : undefined,
      accountHolder: accountHolderIdx >= 0  ? (cols[accountHolderIdx] ?? '').trim() || undefined  : undefined,
      iban:          normalisedIban,
      bic:           bicIdx >= 0            ? (cols[bicIdx] ?? '').trim().toUpperCase() || undefined : undefined,
    })
  }

  return result
}

// ── Legacy detection (fallback) ───────────────────────────────────────────────

const SHOPIFY_COLUMNS = ['financial status', 'lineitem name', 'lineitem sku', 'lineitem quantity', 'lineitem price']
const BELIEVE_COLUMNS = ['release_title', 'barcode', 'upc', 'isrc', 'net_revenue']
const BANDCAMP_COLUMNS = ['item type', 'catalog number', 'artist', 'album title', 'net amount']

/** Legacy file type (excludes the new 'master-data' variant which requires profile matching). */
type LegacyFileType = 'believe' | 'bandcamp' | 'shopify' | 'unknown'

/**
 * Legacy file-type detector using a fixed column-scoring heuristic.
 *
 * This function is kept as a fallback when no CsvImportProfile is available
 * (e.g. the user has not configured any profiles, or profile matching returns
 * no result). It reproduces the original scoring logic exactly so existing
 * workspaces continue working without any migration.
 *
 * @param headerLine - The raw first line of the CSV file.
 * @returns The detected {@link LegacyFileType}: `'believe'`, `'bandcamp'`, `'shopify'`, or `'unknown'`.
 */
export function detectFileType(headerLine: string): LegacyFileType {
  const headers = splitHeader(headerLine)

  const scores: Record<Exclude<LegacyFileType, 'unknown'>, number> = {
    shopify: countMatches(headers, SHOPIFY_COLUMNS),
    believe: countMatches(headers, BELIEVE_COLUMNS),
    bandcamp: countMatches(headers, BANDCAMP_COLUMNS),
  }

  const best = (Object.entries(scores) as Array<[Exclude<LegacyFileType, 'unknown'>, number]>)
    .reduce<[Exclude<LegacyFileType, 'unknown'>, number] | null>((acc, [type, score]) => {
      if (score === 0) return acc
      if (acc === null || score > acc[1]) return [type, score]
      return acc
    }, null)

  return best !== null ? best[0] : 'unknown'
}

// ── Main parse entry point ────────────────────────────────────────────────────

/**
 * Parses a raw CSV string, routing it through the correct parser based on
 * profile matching (preferred) or legacy heuristic detection (fallback).
 *
 * **Routing rules:**
 * 1. If `profiles` is non-empty, attempt profile matching on the header row.
 *    - Profile type 'master-data' → parse with {@link parseMasterDataCSV};
 *      result carries `labelArtists`, not `transactions`.
 *    - Shopify profile → raw orders returned in `shopifyRawOrders` (no transactions).
 *    - Printful profile → raw costs returned in `printfulRawCosts` (no transactions).
 *    - Profile type 'financial', Bandcamp profile → streaming parser, source = 'bandcamp'.
 *    - Profile type 'financial', any other → streaming parser, source = 'believe'.
 * 2. If no profile matches, fall back to {@link detectFileType} + existing parsers.
 *    Legacy Shopify detection returns raw orders (not SalesTransactions) to keep
 *    the parser-facade free of direct e-commerce transformations.
 *
 * @param content  - Raw CSV file content as a string.
 * @param profiles - Known CsvImportProfiles to match against (may be empty).
 * @param source   - Optional explicit source override; bypasses detection.
 * @returns A {@link ParseFileResult} with transactions, labelArtists, or raw buffers.
 */
export async function parseFile(
  content: string,
  profiles: CsvImportProfile[] = [],
  source?: 'believe' | 'bandcamp' | 'shopify'
): Promise<ParseFileResult> {
  const normalised = normaliseCsvContent(content)
  const firstLine = normalised.split('\n')[0] ?? ''
  const rawHeaders = firstLine
    .split(firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',')
    .map(h => h.replace(/['"]/g, '').trim())

  // ── Phase 1: Profile-based detection ───────────────────────────────────────
  if (profiles.length > 0 && !source) {
    const matched = matchProfile(rawHeaders, profiles)

    if (matched) {
      // ── master-data branch ────────────────────────────────────────────────
      if (matched.type === 'master-data') {
        const labelArtists = parseMasterDataCSV(content, matched)
        return {
          fileType: 'master-data',
          profileId: matched.id,
          profileType: 'master-data',
          transactions: [],
          labelArtists,
          errors: [],
          uniqueArtists: [],
        }
      }

      // ── Shopify profile → raw buffer (no direct transformation) ──────────
      if (matched.id === SYSTEM_SHOPIFY_PROFILE_ID) {
        const { orders, errors } = parseShopifyRaw(content)
        return {
          fileType: 'shopify',
          profileId: matched.id,
          profileType: 'financial',
          transactions: [],
          shopifyRawOrders: orders,
          errors,
          uniqueArtists: [],
        }
      }

      // ── Printful profile → raw cost buffer ───────────────────────────────
      if (matched.id === SYSTEM_PRINTFUL_PROFILE_ID) {
        const { costs, errors } = parsePrintfulCSV(content)
        return {
          fileType: 'printful',
          profileId: matched.id,
          profileType: 'financial',
          transactions: [],
          printfulRawCosts: costs,
          errors,
          uniqueArtists: [],
        }
      }

      if (matched.id === SYSTEM_DARKMERCH_PROFILE_ID) {
        const { parseDarkmerchCSV } = await import('./darkmerch-parser')
        const { transactions, errors } = parseDarkmerchCSV(content)
        const artists = [...new Set(transactions.map((t) => t.main_artist).filter(Boolean))]
        return {
          fileType: 'believe',
          profileId: matched.id,
          profileType: 'financial',
          transactions,
          errors,
          uniqueArtists: artists,
        }
      }

      // Bandcamp and Bandcamp DDS profiles: must be routed as 'bandcamp' (not 'believe') to preserve
      // the EUR balance correction logic in streaming-csv-parser that handles
      // Bandcamp's unique per-sale net-amount calculation. DDS payout-fee rows
      // are filtered by the streaming parser when source = 'bandcamp'.
      const parserSource: 'believe' | 'bandcamp' =
        matched.id === SYSTEM_BANDCAMP_PROFILE_ID || matched.id === SYSTEM_BANDCAMP_DDS_PROFILE_ID
          ? 'bandcamp'
          : 'believe'

      const columnMapping = buildStreamingColumnMapping(matched, rawHeaders)
      const streamingResult: StreamingParseResult = await parseCSVContentStreaming(
        content,
        parserSource,
        undefined,
        columnMapping
      )

      return {
        fileType: parserSource,
        profileId: matched.id,
        profileType: 'financial',
        transactions: streamingResult.transactions,
        errors: streamingResult.errors,
        uniqueArtists: streamingResult.uniqueArtists,
      }
    }
  }

  // ── Phase 2: Legacy fallback ─────────────────────────────────────────────
  const detectedType: LegacyFileType = source ?? detectFileType(firstLine)

  if (detectedType === 'shopify') {
    // Return raw orders — callers must reconcile with Printful costs separately.
    const { orders, errors } = parseShopifyRaw(content)
    return {
      fileType: 'shopify',
      transactions: [],
      shopifyRawOrders: orders,
      errors,
      uniqueArtists: [],
    }
  }

  // Believe and Bandcamp share the streaming CSV parser
  const streamingResult: StreamingParseResult = await parseCSVContentStreaming(
    content,
    detectedType === 'unknown' ? 'believe' : detectedType
  )

  return {
    fileType: detectedType,
    transactions: streamingResult.transactions,
    errors: streamingResult.errors,
    uniqueArtists: streamingResult.uniqueArtists,
  }
}

/**
 * Convenience helper: reconcile raw Shopify orders with Printful costs and
 * return the final SalesTransaction array. Used by callers that work with
 * ParseFileResult and need the merged result without repeating merger logic.
 *
 * @param shopifyOrders - From `ParseFileResult.shopifyRawOrders`.
 * @param printfulCosts - From `ParseFileResult.printfulRawCosts` (pass [] when none).
 */
export function reconcileEcommerceBuffers(
  shopifyOrders: ShopifyRawOrder[],
  printfulCosts: PrintfulRawCost[]
) {
  return reconcileMerchTransactions(shopifyOrders, printfulCosts)
}
