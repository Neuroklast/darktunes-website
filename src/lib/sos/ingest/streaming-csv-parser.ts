import Papa, { type ParseResult, type Parser } from 'papaparse'
import type { SalesTransaction } from './csv-parser'
import { mapCSVHeadersToModel } from './csv-parser'
import { normalizeDateToMonth } from './normalizeDateToMonth'
import { parseDarkmerchReportingPeriod } from './darkmerch-parser'
import type { ImportDateOrder, ImportDateSemantics } from './types'
import { parseAmount, parseIntegerAmount, SOURCE_AMOUNT_CONVENTION, type AmountConvention } from './amountParsing'

export { normalizeDateToMonth } from './normalizeDateToMonth'
export type { DateParseSource } from './normalizeDateToMonth'

export interface ParseProgress {
  processedRows: number
  totalRows: number
  percentage: number
  isComplete: boolean
  phase: 'tokenizing' | 'parsing'
}

export interface ParseSkip {
  row: number
  reason: string
}

export interface StreamingParseResult {
  periodStart?: string
  periodEnd?: string
  transactions: SalesTransaction[]
  uniqueArtists: string[]
  errors: Array<{ row: number; reason: string; data: string }>
  skipped: ParseSkip[]
  emptyCurrencyRows: number
}

/** Characters per Papa stream chunk; bounds peak memory while parsing. */
const CHUNK_SIZE = 4 * 1024 * 1024

function isEmptyCsvRow(values: string[]): boolean {
  return values.every((cell) => !cell.trim())
}

/**
 * Removes a UTF-8 BOM character that some editors / Excel exports prepend.
 */
function stripBOM(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text
}

function processChunk(
  rows: string[][],
  headers: string[],
  mapping: Record<string, string>,
  source: 'believe' | 'bandcamp',
  startIndex: number,
  parseTag: string,
  dateSemantics: ImportDateSemantics = 'sale-date',
  dateOrder?: ImportDateOrder,
  amountConvention?: AmountConvention,
): {
  transactions: SalesTransaction[]
  artists: Set<string>
  periodStart?: string
  periodEnd?: string
  errors: Array<{ row: number; reason: string; data: string }>
  skipped: ParseSkip[]
  emptyCurrencyRows: number
} {
  let periodStart: string | undefined
  let periodEnd: string | undefined
  const transactions: SalesTransaction[] = []
  const artists = new Set<string>()
  const errors: Array<{ row: number; reason: string; data: string }> = []
  const skipped: ParseSkip[] = []
  let emptyCurrencyRows = 0
  const expectedCols = headers.length

  for (let i = 0; i < rows.length; i++) {
    const values = rows[i].map((cell) => cell ?? '')
    const rowNumber = startIndex + i + 2
    const rowPreview = values.join(',').substring(0, 120)
    if (isEmptyCsvRow(values)) {
      skipped.push({ row: rowNumber, reason: 'empty-line' })
      continue
    }

    try {
      if (values.length >= expectedCols * 2 && values.length > expectedCols) {
        errors.push({
          row: rowNumber,
          reason: `Too many columns: expected ~${expectedCols}, got ${values.length}`,
          data: rowPreview,
        })
        continue
      }

      const rowData: Record<string, string> = {}
      headers.forEach((header, idx) => {
        rowData[header] = values[idx] ?? ''
      })

      const mappedData: Record<string, string> = {}
      for (const [header, value] of Object.entries(rowData)) {
        const field = mapping[header]
        if (field) mappedData[field] = value
      }

      // Report-level dates are metadata for the entire source, even on rows
      // without payable revenue. Never turn them into per-sale months.
      if (dateSemantics === 'report-period') {
        const period = parseDarkmerchReportingPeriod((mappedData.sales_month ?? '').trim())
        if (period) {
          if (!periodStart || period.periodStart < periodStart) periodStart = period.periodStart
          if (!periodEnd || period.periodEnd > periodEnd) periodEnd = period.periodEnd
        }
      }

      const originalArtist = (mappedData.original_artist ?? '').trim()
      const releaseType = (mappedData.release_type ?? '').trim().toLowerCase()

      // ── Bandcamp-specific row filters ──────────────────────────────────────
      if (source === 'bandcamp' && releaseType === 'payout') {
        skipped.push({ row: rowNumber, reason: 'bandcamp-payout' })
        continue
      }

      // ── Revenue resolution ─────────────────────────────────────────────────
      // Universal rule: use the "net amount" / "Net Revenue" column (net_revenue)
      // and the currency column for all sources.
      //
      // Bandcamp-specific rationale: "balance of revenue share (EUR)" is the
      // collection-society running balance (per-session cumulative), not the
      // per-transaction payout received by the label.  The correct column is
      // "net amount".  Earlier code incorrectly preferred balance_eur, which
      // also suffered from fuzzy-matching contamination by the GBP/PLN/USD
      // balance columns (all four map to balance_eur and the last write wins).
      // Revenue is a required amount: invalid or missing values become visible
      // row errors instead of a silent 0 (no factor-100 misreads).
      const convention = amountConvention ?? SOURCE_AMOUNT_CONVENTION[source]
      const revenueResult = parseAmount(mappedData.net_revenue ?? '', convention)
      if (revenueResult.kind === 'invalid') {
        errors.push({
          row: rowNumber,
          reason: `Invalid "net_revenue" value "${mappedData.net_revenue ?? ''}" (${revenueResult.reason})`,
          data: rowPreview,
        })
        continue
      }
      if (revenueResult.kind === 'empty') {
        errors.push({
          row: rowNumber,
          reason: 'Missing required "net_revenue" value',
          data: rowPreview,
        })
        continue
      }
      const netRevenue = revenueResult.value

      const rawCurrency = (mappedData.currency ?? '').trim()
      if (!rawCurrency) emptyCurrencyRows += 1
      const currency = rawCurrency || 'EUR'

      // Quantity is optional (explicit field rule: empty → 0). Invalid text is
      // an error; 0 and negative refunds are kept as parsed.
      const quantityResult = parseIntegerAmount(mappedData.quantity ?? '')
      if (quantityResult.kind === 'invalid') {
        errors.push({
          row: rowNumber,
          reason: `Invalid "quantity" value "${mappedData.quantity ?? ''}" (${quantityResult.reason})`,
          data: rowPreview,
        })
        continue
      }
      const quantity = quantityResult.kind === 'valid' ? quantityResult.value : 0

      // ── Physical product detection ─────────────────────────────────────────
      // Bandcamp: use the "package" column — if it contains the word "digital"
      // (e.g. "digital download", "digital bundle") the row is a digital
      // download; any other non-empty value (e.g. "Limited Digipac CD",
      // "BLACKBOOK Confession T-Shirt") is a physical product that counts
      // toward the physical-split bucket.
      // Fallback to release_type keywords when the package column is absent.
      // For all other sources: rely on the release_type column keywords only.
      let isPhysical: boolean
      if (source === 'bandcamp') {
        const bcPackage = (mappedData.bandcamp_package ?? '').trim()
        isPhysical = bcPackage.length > 0
          ? !/digital/i.test(bcPackage)
          : /physical|cd|vinyl|cassette|tape/i.test(releaseType)
      } else {
        isPhysical = /physical|cd|vinyl|cassette|tape/i.test(releaseType)
      }

      // ── Download vs stream detection ───────────────────────────────────────
      // Bandcamp is a purchase/download platform: all non-physical Bandcamp
      // transactions default to `is_download = true`. If `release_type` explicitly
      // contains "stream" the row is classified as a stream (`is_download = false`);
      // otherwise (empty or any other value) it is treated as a download.
      // For Believe and other sources, `is_download` is set only when `release_type`
      // is present; undefined means no type info is available.
      let isDownload: boolean | undefined
      if (!isPhysical) {
        if (source === 'bandcamp') {
          // `true` for all non-physical Bandcamp rows unless release_type is "stream".
          isDownload = !releaseType || !/stream/i.test(releaseType)
        } else if (releaseType) {
          isDownload = /download/i.test(releaseType)
        }
      }

      if (!originalArtist && netRevenue === 0) {
        skipped.push({ row: rowNumber, reason: 'no-artist-zero-revenue' })
        continue
      }

      if (originalArtist) artists.add(originalArtist)

      // Normalise the date to YYYY-MM for all sources.
      const rawMonth = (mappedData.sales_month ?? '').trim()
      const salesMonth = dateSemantics === 'sale-date' ? normalizeDateToMonth(rawMonth, source, dateOrder) : ''

      // Bandcamp CSVs have no dedicated platform column; default to "Bandcamp".
      const platform = (mappedData.platform ?? '').trim() || (source === 'bandcamp' ? 'Bandcamp' : '')

      const sourceId = `${parseTag}-${startIndex + i}`
      const sourceValues = headers.map((_, col) => values[col] ?? '')
      transactions.push({
        id: sourceId,
        source,
        sales_month: salesMonth,
        platform,
        country: (mappedData.country ?? '').trim(),
        main_artist: originalArtist,
        original_artist: originalArtist,
        release_title: (mappedData.release_title ?? '').trim() || (mappedData.track_title ?? '').trim(),
        track_title: (mappedData.track_title ?? '').trim() || (mappedData.release_title ?? '').trim(),
        upc_ean: (mappedData.upc_ean ?? '').trim(),
        isrc: (mappedData.isrc ?? '').trim(),
        catalog_number: (mappedData.catalog_number ?? '').trim(),
        quantity,
        net_revenue: netRevenue,
        currency,
        is_physical: isPhysical,
        ...(isDownload !== undefined ? { is_download: isDownload } : {}),
        source_row_id: sourceId,
        source_headers: headers,
        source_values: sourceValues,
      })
    } catch (err) {
      errors.push({
        row: rowNumber,
        reason: err instanceof Error ? err.message : 'Unknown parsing error',
        data: rowPreview,
      })
    }
  }

  return { transactions, artists, periodStart, periodEnd, errors, skipped, emptyCurrencyRows }
}

/**
 * Parses a CSV file in chunks, yielding progress callbacks between chunks so
 * the main thread stays responsive even for files with hundreds of thousands
 * of rows.
 *
 * @param customAliases - Optional map of fieldName → additional synonyms to
 *   extend the built-in semantic dictionary (from user CSV column settings).
 */
export async function parseCSVContentStreaming(
  csvContent: string,
  source: 'believe' | 'bandcamp',
  onProgress?: (progress: ParseProgress) => void,
  columnMapping?: Record<string, string>,
  customAliases?: Record<string, string[]>,
  dateSemantics: ImportDateSemantics = 'sale-date',
  dateOrder?: ImportDateOrder,
  amountConvention?: AmountConvention,
): Promise<StreamingParseResult> {
  const allTransactions: SalesTransaction[] = []
  const uniqueArtistsSet = new Set<string>()
  const allErrors: Array<{ row: number; reason: string; data: string }> = []
  const allSkipped: ParseSkip[] = []
  let emptyCurrencyRows = 0
  let reportStart: string | undefined
  let reportEnd: string | undefined

  onProgress?.({
    processedRows: 0,
    totalRows: 0,
    percentage: 0,
    isComplete: false,
    phase: 'tokenizing',
  })

  const content = stripBOM(csvContent)

  // Line count is an upper-bound estimate (quoted newlines inflate it); good
  // enough for the progress denominator while streaming.
  let totalRows = 0
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) totalRows++
  }

  // Short random tag to make transaction IDs unique across multiple parse calls.
  const parseTag = `${source}-${Math.random().toString(36).slice(2, 8)}`

  // True streaming: Papa feeds the string in CHUNK_SIZE pieces and drops each
  // piece after the callback, so we never materialize the full row array.
  return await new Promise<StreamingParseResult>((resolve, reject) => {
    let headers: string[] | null = null
    let mapping: Record<string, string> | null = null
    let sawHeader = false
    let sawAnyRow = false
    let processedRows = 0

    Papa.parse<string[]>(content, {
      delimiter: '',
      skipEmptyLines: false,
      chunkSize: CHUNK_SIZE,
      chunk: (results: ParseResult<string[]>, papa: Parser) => {
        const rows = (results.data ?? []).map((row) =>
          Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [String(row ?? '')],
        )

        const dataRows: string[][] = []
        for (const row of rows) {
          // Leading blank lines before the header are ignored, like the old
          // findIndex(!isEmptyCsvRow) behaviour.
          if (!sawAnyRow && isEmptyCsvRow(row)) continue

          if (!sawHeader) {
            sawAnyRow = true
            const headerCells = row.map((header) => header.trim())
            headers = headerCells
            sawHeader = true
            if (headerCells.length === 0 || headerCells.every((header) => !header)) {
              papa.abort()
              // abort from inside the chunk callback skips `complete`, so settle here.
              resolve({
                transactions: [],
                uniqueArtists: [],
                errors: [{ row: 1, reason: 'Empty header row', data: '' }],
                skipped: [],
                emptyCurrencyRows: 0,
              })
              return
            }
            mapping = mapCSVHeadersToModel(headerCells, customAliases)
            if (columnMapping) {
              // Confirmed mappings win even when an alias resolves to the same
              // field under another column later in the source CSV.
              for (const [header, field] of Object.entries(columnMapping)) {
                for (const [otherHeader, otherField] of Object.entries(mapping)) {
                  if (otherHeader !== header && otherField === field) delete mapping[otherHeader]
                }
                mapping[header] = field
              }
            }
            continue
          }

          sawAnyRow = true
          dataRows.push(row)
        }

        if (!sawHeader || !headers || !mapping || dataRows.length === 0) return

        const result = processChunk(dataRows, headers, mapping, source, processedRows, parseTag, dateSemantics, dateOrder, amountConvention)
        if (result.periodStart && (!reportStart || result.periodStart < reportStart)) reportStart = result.periodStart
        if (result.periodEnd && (!reportEnd || result.periodEnd > reportEnd)) reportEnd = result.periodEnd

        for (const t of result.transactions) allTransactions.push(t)
        result.artists.forEach((a) => uniqueArtistsSet.add(a))
        for (const e of result.errors) allErrors.push(e)
        for (const skip of result.skipped) allSkipped.push(skip)
        emptyCurrencyRows += result.emptyCurrencyRows

        processedRows += dataRows.length

        onProgress?.({
          processedRows,
          totalRows,
          percentage:
            totalRows > 0 ? Math.min(99, Math.round((processedRows / totalRows) * 100)) : 0,
          isComplete: false,
          phase: 'parsing',
        })
      },
      complete: () => {
        if (!sawHeader) {
          resolve({
            transactions: [],
            uniqueArtists: [],
            errors: [],
            skipped: [],
            emptyCurrencyRows: 0,
          })
          return
        }

        onProgress?.({
          processedRows,
          totalRows: Math.max(totalRows, processedRows),
          percentage: 100,
          isComplete: true,
          phase: 'parsing',
        })

        resolve({
          transactions: allTransactions,
          uniqueArtists: Array.from(uniqueArtistsSet).sort(),
          errors: allErrors,
          skipped: allSkipped,
          emptyCurrencyRows,
          ...(reportStart && reportEnd ? { periodStart: reportStart, periodEnd: reportEnd } : {}),
        })
      },
      error: (err: Error) => reject(err instanceof Error ? err : new Error(String(err))),
    })
  })
}
