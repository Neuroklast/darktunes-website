export { normalizeDateToMonth } from './normalizeDateToMonth'
import { normalizeDateToMonth } from './normalizeDateToMonth'

export interface SalesTransaction {
  id: string
  source: 'believe' | 'bandcamp' | 'manual' | 'shopify' | 'darkmerch'
  sales_month: string
  platform: string
  country: string
  main_artist: string
  original_artist: string
  release_title: string
  track_title: string
  upc_ean: string
  isrc: string
  catalog_number: string
  quantity: number
  net_revenue: number
  currency: string
  is_physical: boolean
  /**
   * True when the digital transaction represents a download (as opposed to a
   * stream). `undefined` when the source CSV does not provide release-type
   * information (e.g. Bandcamp aggregated rows).
   * Only meaningful when `is_physical` is `false`.
   */
  is_download?: boolean
}

export interface ParsedCSVData {
  transactions: SalesTransaction[]
  uniqueArtists: string[]
  errors: Array<{ row: number, reason: string, data: string }>
}

export const semanticDictionary: Record<string, string[]> = {
  sales_month: ["Believe Sales Month", "Sales Month", "Month", "Date", "Period", "Verkaufsmonat", "Datum", "Reporting Period"],
  platform: ["Platform", "Store", "Shop", "Plattform", "Provider", "Service", "DSP"],
  country: ["Country/Region", "Country", "Region", "Territory", "Land", "Territorium"],
  original_artist: ["Artist Name", "Artist", "Band", "Künstler", "Main Artist", "Track Artist"],
  release_title: ["Release title", "Release", "Album", "Album Title", "Titel", "Project Name", "item name"],
  track_title: ["Track title", "Track", "Song", "Title", "Track Name", "Songtitel"],
  upc_ean: ["UPC", "EAN", "Barcode", "GTIN", "Release UPC"],
  isrc: ["ISRC", "Track ISRC", "Recording ISRC"],
  catalog_number: ["Release Catalog nb", "Catalog Number", "Cat No", "Cat Number", "Katalognummer", "Catalog"],
  quantity: ["Quantity", "Qty", "Downloads", "Streams", "Units", "Anzahl", "Menge", "Verkäufe"],
  net_revenue: ["Net Revenue", "Revenue", "Umsatz", "Netto", "Net Amount", "net amount", "Amount You Received", "amount you received", "Earnings", "Amount", "item price"],
  currency: ["Currency", "Währung", "Curr", "Paid Currency", "currency code"],
  release_type: ["Release Type", "Sales Type", "Format", "Product Type", "Physical", "Medium", "Type", "item type"],
  /** Bandcamp-specific column: pre-converted EUR balance for this transaction row. */
  balance_eur: ["balance of revenue share (EUR)", "balance (EUR)", "revenue share (EUR)", "eur balance", "EUR Balance"],
  /**
   * Bandcamp-specific column that identifies the product purchased.
   * Values like "digital download" or "digital bundle" indicate a digital
   * download; any other value (e.g. "Limited Digipac CD", "Bundle 1") means
   * a physical product to be counted under the physical-split bucket.
   */
  bandcamp_package: ["package"],
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
  return (maxLen - distance) / maxLen
}

/**
 * Builds a merged dictionary from the built-in semantic dictionary and any
 * user-defined custom synonyms (e.g. from the CSV Column Mapping settings).
 */
export function buildMergedDictionary(
  customAliases?: Record<string, string[]>
): Record<string, string[]> {
  if (!customAliases) return semanticDictionary

  const merged: Record<string, string[]> = {}
  for (const [field, synonyms] of Object.entries(semanticDictionary)) {
    merged[field] = [...synonyms, ...(customAliases[field] ?? [])]
  }
  return merged
}

export function mapCSVHeadersToModel(
  headers: string[],
  customAliases?: Record<string, string[]>
): Record<string, string> {
  const mapping: Record<string, string> = {}
  const dictionary = buildMergedDictionary(customAliases)

  headers.forEach((header) => {
    const normalized = header.trim().toLowerCase().replace(/\s+/g, '')

    // Exact match pass
    for (const [fieldName, synonyms] of Object.entries(dictionary)) {
      for (const synonym of synonyms) {
        const normalizedSynonym = synonym.toLowerCase().replace(/\s+/g, '')
        if (normalized === normalizedSynonym) {
          mapping[header] = fieldName
          return
        }
      }
    }

    // Fuzzy match pass (similarity ≥ 0.8)
    for (const [fieldName, synonyms] of Object.entries(dictionary)) {
      for (const synonym of synonyms) {
        const similarity = calculateSimilarity(header, synonym)
        if (similarity >= 0.8 && !mapping[header]) {
          mapping[header] = fieldName
          break
        }
      }
      if (mapping[header]) break
    }
  })

  return mapping
}

export function parseCSVContent(
  csvContent: string,
  source: 'believe' | 'bandcamp',
  columnMapping?: Record<string, string>
): ParsedCSVData {
  const transactions: SalesTransaction[] = []
  const uniqueArtistsSet = new Set<string>()
  const errors: Array<{ row: number, reason: string, data: string }> = []

  const lines = csvContent.split('\n').filter(line => line.trim())
  if (lines.length === 0) {
    return { transactions, uniqueArtists: [], errors }
  }

  const delim = csvContent.includes(';') ? ';' : ','
  const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''))
  
  const mapping = columnMapping || mapCSVHeadersToModel(headers)

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCSVLine(lines[i], delim)
      
      if (values.length !== headers.length && values.length > 0) {
        errors.push({
          row: i + 1,
          reason: `Column count mismatch: expected ${headers.length}, got ${values.length}`,
          data: lines[i].substring(0, 100)
        })
        continue
      }

      const rowData: Record<string, string> = {}
      headers.forEach((header, index) => {
        rowData[header] = values[index] || ''
      })

      const mappedData: Partial<Record<keyof typeof semanticDictionary, string>> = {}
      for (const [originalHeader, value] of Object.entries(rowData)) {
        const mappedField = mapping[originalHeader]
        if (mappedField) {
          mappedData[mappedField as keyof typeof semanticDictionary] = value
        }
      }

      const releaseType = (mappedData.release_type || '').toLowerCase().trim()
      if (source === 'bandcamp' && releaseType === 'payout') {
        continue // Ignoriere Label-Auszahlungen komplett!
      }

      // ── Physical product detection ─────────────────────────────────────────
      // Bandcamp: use the "package" column — if it contains the word "digital"
      // (e.g. "digital download", "digital bundle") it is a download; any other
      // non-empty value (e.g. "Limited Digipac CD") is a physical product.
      // For all other sources: rely on the release_type column keywords.
      let isPhysical: boolean
      if (source === 'bandcamp') {
        const bcPackage = (mappedData.bandcamp_package || '').trim()
        isPhysical = bcPackage.length > 0
          ? !/digital/i.test(bcPackage)
          : /physical|cd|vinyl|cassette|tape/i.test(releaseType)
      } else {
        isPhysical = /physical|cd|vinyl|cassette|tape/i.test(releaseType)
      }

      // ── Revenue resolution ─────────────────────────────────────────────────
      // All sources: use the "net amount" / "Net Revenue" column (mapped to
      // net_revenue) and the currency column directly.
      // Note for Bandcamp: "balance of revenue share (EUR)" is the collection-
      // society running balance, NOT the per-transaction net revenue, and must
      // not be used here — the correct column is "net amount".
      const finalRevenueStr = mappedData.net_revenue || '0'
      const finalCurrency = mappedData.currency || 'EUR'
      const netRevenue = parseFloat(finalRevenueStr.replace(/[^0-9.-]/g, '')) || 0

      const originalArtist = mappedData.original_artist || ''
      const quantityStr = mappedData.quantity || '0'
      const quantity = parseInt(quantityStr.replace(/[^0-9]/g, '')) || 0

      if (originalArtist) {
        uniqueArtistsSet.add(originalArtist)
      }

      const transaction: SalesTransaction = {
        id: crypto.randomUUID(),
        source,
        sales_month: normalizeDateToMonth(mappedData.sales_month || '', source),
        platform: mappedData.platform || '',
        country: mappedData.country || '',
        main_artist: originalArtist,
        original_artist: originalArtist,
        // Bandcamp only provides "item name" → release_title, leaving track_title empty.
        // Apply mutual fallback so both fields carry a usable title regardless of source format.
        release_title: mappedData.release_title || mappedData.track_title || '',
        track_title: mappedData.track_title || mappedData.release_title || '',
        upc_ean: mappedData.upc_ean || '',
        isrc: mappedData.isrc || '',
        catalog_number: mappedData.catalog_number || '',
        quantity,
        net_revenue: netRevenue,
        currency: finalCurrency,
        is_physical: isPhysical
      }

      transactions.push(transaction)
    } catch (error) {
      errors.push({
        row: i + 1,
        reason: error instanceof Error ? error.message : 'Unknown parsing error',
        data: lines[i].substring(0, 100)
      })
    }
  }

  return {
    transactions,
    uniqueArtists: Array.from(uniqueArtistsSet).sort(),
    errors
  }
}

/** Parses a single CSV line respecting quoted fields and escaped quotes. */
export function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/**
 * Splits a group of artist names on secondary separators (&, and, x, ,).
 * Returns individual trimmed names, filtering out empty strings.
 */
function splitOnSecondaryDelimiters(part: string): string[] {
  return part
    .split(/\s*(?:&|,|\bx\b)\s*|\s+and\s+/gi)
    .map(a => a.trim())
    .filter(a => a.length > 0)
}

/**
 * Multi-level hierarchical artist parser.
 *
 * Level 1 – split on primary "featuring" keywords (feat., ft., featuring).
 *   Parenthesized forms like "(feat. X)" are also handled.
 * Level 2 – within each resulting group, split on secondary delimiters
 *   (&, and, x, ,) to extract individual artists.
 *
 * Returns all individual artists; the first element is always the primary.
 */
export function extractFeaturedArtistsDetailed(artistName: string): {
  primary: string
  featured: string[]
} {
  if (!artistName || !artistName.trim()) {
    return { primary: '', featured: [] }
  }

  const cleaned = artistName.trim()

  // Level 1: split on "feat.", "ft.", "featuring" (with optional parentheses)
  const primarySplitRegex = /\s*[[(]?\s*(?:feat\.|feat\b|ft\.|ft\b|featuring)\s*/gi
  const parts = cleaned.split(primarySplitRegex).map(p => p.replace(/[\])]?\s*$/, '').trim()).filter(p => p.length > 0)

  if (parts.length === 1) {
    // No primary "featuring" separator found — treat the whole string as a
    // single collaboration and split on secondary delimiters only if needed
    // (e.g. "Artist A & Artist B" without "feat.").
    const all = splitOnSecondaryDelimiters(parts[0])
    if (all.length === 0) return { primary: cleaned, featured: [] }
    const [primary, ...featured] = all
    return { primary, featured }
  }

  // The first part is the primary artist group; the rest are featured groups
  const primaryGroup = splitOnSecondaryDelimiters(parts[0])
  const featuredGroups = parts.slice(1).flatMap(p => splitOnSecondaryDelimiters(p))

  const primary = primaryGroup[0] ?? cleaned
  const featured = [...primaryGroup.slice(1), ...featuredGroups]

  return { primary, featured }
}

/**
 * Returns all individual artists extracted from a collaboration string.
 * The first element is always the primary artist.
 * Backward-compatible replacement for the old single-level implementation.
 */
export function extractFeaturedArtists(artistName: string): string[] {
  if (!artistName || !artistName.trim()) return []

  const { primary, featured } = extractFeaturedArtistsDetailed(artistName)
  const all = primary ? [primary, ...featured] : featured
  return all.filter(a => a.length > 0)
}

export function suggestArtistMappings(uniqueArtists: string[]): Array<{
  featuringName: string
  primaryArtist: string
  confidence: 'high' | 'medium'
}> {
  const suggestions: Array<{
    featuringName: string
    primaryArtist: string
    confidence: 'high' | 'medium'
  }> = []

  for (const artist of uniqueArtists) {
    const { primary, featured } = extractFeaturedArtistsDetailed(artist)

    if (featured.length > 0) {
      // Always suggest mapping the full collaboration string to the primary
      suggestions.push({
        featuringName: artist,
        primaryArtist: primary,
        confidence: 'high',
      })

      // Also suggest mappings for featured artists back to the primary so
      // they don't appear as separate artists in the dashboard
      for (const feat of featured) {
        suggestions.push({
          featuringName: feat,
          primaryArtist: primary,
          confidence: 'medium',
        })
      }
    }
  }

  return suggestions
}
