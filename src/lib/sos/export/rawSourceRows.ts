import { normalizeArtistNameKey } from '../artistNameKey'
import type { SalesTransaction } from '../ingest/csv-parser'

/**
 * Believe headers that reveal distributor commission / deal terms.
 * Matched after normalizeHeader; never strip Net Revenue.
 */
export const BELIEVE_RAW_DENIED_HEADER_PATTERNS: readonly RegExp[] = [
  /gross\s*rev/,
  /bruttoumsatz/,
  /client\s*share/,
  /kundenanteil/,
  /kundenquote/,
  /believe\s*(share|commission|margin|fee)/,
  /distributor\s*(share|commission|margin)/,
  /^(commission|margin)$/,
]

/** @deprecated Use BELIEVE_RAW_DENIED_HEADER_PATTERNS. Kept for existing tests. */
export const BELIEVE_RAW_DENIED_HEADERS = [
  'gross revenue',
  'client share rate',
  'client share',
] as const

export const RAW_EXPORT_SOURCES = ['believe', 'bandcamp', 'darkmerch'] as const
export type RawExportSource = (typeof RAW_EXPORT_SOURCES)[number]

export const RAW_SOURCE_SHEET_NAMES: Record<RawExportSource, string> = {
  believe: 'Believe',
  bandcamp: 'Bandcamp',
  darkmerch: 'Darkmerch',
}

export interface ArtistRawSourceSheet {
  source: RawExportSource
  sheetName: string
  headers: string[]
  rows: string[][]
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isDeniedBelieveHeader(header: string): boolean {
  const key = normalizeHeader(header)
  if (!key || key.includes('net rev') || key === 'netto' || key.includes('net revenue')) {
    return false
  }
  return BELIEVE_RAW_DENIED_HEADER_PATTERNS.some((pattern) => pattern.test(key))
}

/** Excel forbids \ / ? * [ ] and caps names at 31 characters. */
export function excelSafeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim()
  return (cleaned || 'Raw').slice(0, 31)
}

export function missingOriginalReportSources(
  artistData: {
    believeRevenue: number
    bandcampRevenue: number
    darkmerchRevenue: number
  },
  sheets: ArtistRawSourceSheet[],
): RawExportSource[] {
  const have = new Set(
    sheets.filter((sheet) => sheet.rows.length > 0).map((sheet) => sheet.source),
  )
  const missing: RawExportSource[] = []
  if (artistData.believeRevenue > 0 && !have.has('believe')) missing.push('believe')
  if (artistData.bandcampRevenue > 0 && !have.has('bandcamp')) missing.push('bandcamp')
  if (artistData.darkmerchRevenue > 0 && !have.has('darkmerch')) missing.push('darkmerch')
  return missing
}

export function stripDeniedSourceColumns(
  headers: string[],
  rows: string[][],
  source: RawExportSource,
): { headers: string[]; rows: string[][] } {
  if (source !== 'believe') return { headers, rows }
  const keep = headers.map((header, index) => ({ header, index, keep: !isDeniedBelieveHeader(header) }))
  const kept = keep.filter((column) => column.keep)
  return {
    headers: kept.map((column) => column.header),
    rows: rows.map((row) => kept.map((column) => row[column.index] ?? '')),
  }
}

function unionHeaders(headerSets: string[][]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const headers of headerSets) {
    for (const header of headers) {
      const key = normalizeHeader(header)
      if (!key || seen.has(key)) continue
      seen.add(key)
      ordered.push(header)
    }
  }
  return ordered
}

function cellsForHeaders(headers: string[], sourceHeaders: string[], sourceValues: string[]): string[] {
  const indexByKey = new Map<string, number>()
  sourceHeaders.forEach((header, index) => {
    const key = normalizeHeader(header)
    if (key && !indexByKey.has(key)) indexByKey.set(key, index)
  })
  return headers.map((header) => {
    const index = indexByKey.get(normalizeHeader(header))
    return index == null ? '' : (sourceValues[index] ?? '')
  })
}

function buildSheetForSource(
  transactions: SalesTransaction[],
  source: RawExportSource,
): ArtistRawSourceSheet | null {
  const seenRowIds = new Set<string>()
  const sourceRows: Array<{ headers: string[]; values: string[] }> = []

  for (const tx of transactions) {
    if (tx.source !== source) continue
    const headers = tx.source_headers
    const values = tx.source_values
    if (!headers?.length || !values) continue

    const rowId = tx.source_row_id ?? tx.id
    if (seenRowIds.has(rowId)) continue
    seenRowIds.add(rowId)
    sourceRows.push({ headers, values })
  }

  if (sourceRows.length === 0) return null

  const headers = unionHeaders(sourceRows.map((row) => row.headers))
  const rawRows = sourceRows.map((row) => cellsForHeaders(headers, row.headers, row.values))
  const stripped = stripDeniedSourceColumns(headers, rawRows, source)
  if (stripped.headers.length === 0) return null

  return {
    source,
    sheetName: excelSafeSheetName(RAW_SOURCE_SHEET_NAMES[source]),
    headers: stripped.headers,
    rows: stripped.rows,
  }
}

/**
 * Builds one original-report sheet per uploaded source for each artist.
 * Believe drops margin columns; Bandcamp/Darkmerch keep every original column.
 */
export function buildArtistRawSheets(
  artistData: Array<{ artist: string; transactions: SalesTransaction[] }>,
): Map<string, ArtistRawSourceSheet[]> {
  const sheets = new Map<string, ArtistRawSourceSheet[]>()

  for (const { artist, transactions } of artistData) {
    const artistSheets: ArtistRawSourceSheet[] = []
    for (const source of RAW_EXPORT_SOURCES) {
      const sheet = buildSheetForSource(transactions, source)
      if (sheet) artistSheets.push(sheet)
    }
    if (artistSheets.length > 0) {
      sheets.set(normalizeArtistNameKey(artist), artistSheets)
    }
  }

  return sheets
}

export function lookupArtistRawSheets(
  sheets: Map<string, ArtistRawSourceSheet[]>,
  artist: string,
): ArtistRawSourceSheet[] {
  return sheets.get(normalizeArtistNameKey(artist)) ?? []
}
