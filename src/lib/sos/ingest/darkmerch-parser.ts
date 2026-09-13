/**
 * Darkmerch CSV parser.
 *
 * Expected CSV format (comma-delimited):
 *   DATE,ORDER NUMBER,BAND,NET REVENUE
 *   Q4 2025 - Q1 2026,1005,SMASH HIT COMBO,5
 *   Q4 2025 - Q1 2026,1008,darkmerch,
 *
 * Parser rules:
 *   - The header row is consumed and column positions are detected by name.
 *   - Column names are matched with alias lists to handle variant spellings
 *     (e.g. BAND / ARTIST / ARTIST NAME) and different localisations.
 *   - Rows where NET REVENUE is empty or zero are skipped.
 *   - Each valid row produces one SalesTransaction with is_physical = true.
 *
 * XLSX support:
 *   - Use `parseDarkmerchXLSX` to parse an `.xlsx` file (ArrayBuffer).
 *     It converts the first sheet to CSV and delegates to `parseDarkmerchCSV`.
 *   - Use `darkmerchXLSXtoCSV` to obtain a storable CSV string from an XLSX
 *     buffer without producing a full parse result.
 */

import type { SalesTransaction } from './csv-parser'

export interface DarkmerchParseResult {
  transactions: SalesTransaction[]
  errors: Array<{ row: number; reason: string; data: string }>
}

// ── Column alias lists (all uppercase for comparison) ──────────────────────
// Each list contains all known header variants for that logical column.
// The first matching alias wins.

const BAND_ALIASES = ['BAND', 'ARTIST', 'BAND NAME', 'ARTIST NAME', 'KÜNSTLER', 'ACT', 'INTERPRET']
const REVENUE_ALIASES = ['NET REVENUE', 'REVENUE', 'NET', 'NETTO', 'BETRAG', 'AMOUNT', 'NET_REVENUE', 'NETTOUMSATZ']
const DATE_ALIASES = ['DATE', 'DATUM', 'PERIOD', 'ZEITRAUM', 'REPORTING PERIOD', 'ABRECHNUNGSZEITRAUM']

/**
 * Returns the index of the first alias found in `headers`, or -1 if none match.
 *
 * @param headers - Uppercased header tokens from the CSV file.
 * @param aliases - List of acceptable column name variants.
 */
function findColByAliases(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias)
    if (idx !== -1) return idx
  }
  return -1
}

/**
 * Parses a Darkmerch orders CSV and returns a list of SalesTransactions.
 *
 * @param content - Raw CSV string with a Darkmerch-format header row.
 * @returns Parsed transactions and any row-level parse errors.
 */
export function parseDarkmerchCSV(content: string): DarkmerchParseResult {
  const transactions: SalesTransaction[] = []
  const errors: Array<{ row: number; reason: string; data: string }> = []

  const lines = content.split(/\r?\n/)
  if (lines.length === 0) return { transactions, errors }

  // ── Detect header and column indices ───────────────────────────────────────
  const headerLine = lines[0] ?? ''
  const delimiter = headerLine.includes(';') ? ';' : ','
  const originalHeaders = headerLine.split(delimiter).map(h => h.trim())
  const headers = originalHeaders.map(h => h.toUpperCase())

  const colDate = findColByAliases(headers, DATE_ALIASES)
  const colBand = findColByAliases(headers, BAND_ALIASES)
  const colRevenue = findColByAliases(headers, REVENUE_ALIASES)

  if (colBand === -1 || colRevenue === -1) {
    errors.push({
      row: 0,
      reason: `Missing required columns: BAND (or alias: ${BAND_ALIASES.slice(1).join(' / ')}) and NET REVENUE (or alias: ${REVENUE_ALIASES.slice(1).join(' / ')})`,
      data: headerLine,
    })
    return { transactions, errors }
  }

  // ── Parse data rows ─────────────────────────────────────────────────────────
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue

    const cols = line.split(delimiter).map(c => c.trim())

    const bandValue = cols[colBand] ?? ''
    const revenueStr = cols[colRevenue] ?? ''
    const dateValue = colDate >= 0 ? (cols[colDate] ?? '') : ''

    // Skip rows with no artist name
    if (!bandValue) {
      errors.push({ row: i + 1, reason: 'Empty BAND value', data: line })
      continue
    }

    // Skip rows where NET REVENUE is empty or zero
    if (revenueStr === '') continue
    const netRevenue = parseFloat(revenueStr.replace(',', '.'))
    if (isNaN(netRevenue) || netRevenue === 0) continue

    const sourceId = crypto.randomUUID()
    transactions.push({
      id: sourceId,
      source: 'darkmerch',
      sales_month: '',
      platform: 'DARKMERCH',
      country: '',
      main_artist: bandValue,
      original_artist: bandValue,
      // release_title stores the reporting period (DATE column) so the
      // revenue is grouped per-period in the release breakdown table.
      release_title: dateValue,
      track_title: '',
      upc_ean: '',
      isrc: '',
      catalog_number: '',
      // Darkmerch CSVs report aggregated revenue per order — assume qty 1
      // unless the source format provides per-item granularity.
      quantity: 1,
      net_revenue: netRevenue,
      currency: 'EUR',
      is_physical: true,
      source_row_id: sourceId,
      source_headers: originalHeaders,
      source_values: originalHeaders.map((_, col) => cols[col] ?? ''),
    })
  }

  return { transactions, errors }
}

/**
 * Converts a Darkmerch XLSX file to a CSV string without fully parsing it.
 * Returns null if the conversion fails (e.g. corrupted file, missing library).
 *
 * This function is intentionally separate from {@link parseDarkmerchXLSX} so that
 * `useFileManager` can obtain a storable CSV string before the worker receives it.
 * By storing CSV instead of raw binary, the worker always receives a valid text
 * payload regardless of the original file format.
 *
 * **Why dynamic import?** ExcelJS is a large dependency. Using a dynamic import
 * ensures the module is only loaded when an XLSX file is actually uploaded,
 * keeping the initial bundle lean for users who only upload CSV files.
 *
 * @param buffer - Raw XLSX file content as an ArrayBuffer.
 * @returns CSV string on success, or `null` if conversion failed.
 *   Returns `null` when: (1) ExcelJS module fails to load, (2) workbook has no sheets,
 *   (3) first sheet cannot be read, or (4) any other XLSX parsing exception occurs.
 */
export async function darkmerchXLSXtoCSV(buffer: ArrayBuffer): Promise<string | null> {
  let ExcelJS: typeof import('exceljs')
  try {
    ExcelJS = await import('exceljs')
  } catch (err) {
    console.error('[darkmerchXLSXtoCSV] Failed to load ExcelJS library:', err)
    return null
  }
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(buffer) as never)
    const sheet = workbook.worksheets[0]
    if (!sheet) return null
    return worksheetToCSV(sheet)
  } catch (err) {
    console.error('[darkmerchXLSXtoCSV] Failed to parse XLSX workbook:', err)
    return null
  }
}

/**
 * Parses a Darkmerch orders XLSX file and returns a list of SalesTransactions.
 *
 * Reads the first sheet of the workbook, converts it to CSV via ExcelJS, and
 * delegates to {@link parseDarkmerchCSV} for row-level parsing.
 *
 * **Why dynamic import?** ExcelJS is a large dependency. Using a dynamic import
 * ensures the module is only loaded when an XLSX file is actually uploaded,
 * keeping the initial bundle lean for users who only upload CSV files.
 *
 * **Edge cases:**
 * - Empty workbook (no sheets) → returns a structured error, no exception thrown.
 * - Corrupted or unsupported XLSX format → caught internally and returned as a
 *   structured error so callers do not need additional try-catch.
 *
 * @param buffer - Raw XLSX file content as an ArrayBuffer.
 * @returns Parsed transactions and any row-level or structural parse errors.
 */
export async function parseDarkmerchXLSX(buffer: ArrayBuffer): Promise<DarkmerchParseResult> {
  let ExcelJS: typeof import('exceljs')
  try {
    ExcelJS = await import('exceljs')
  } catch {
    return {
      transactions: [],
      errors: [{ row: 0, reason: 'Failed to load XLSX library', data: '' }],
    }
  }

  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(buffer) as never)
    const sheet = workbook.worksheets[0]
    if (!sheet) {
      return {
        transactions: [],
        errors: [{ row: 0, reason: 'XLSX workbook has no sheets', data: '' }],
      }
    }
    const csv = worksheetToCSV(sheet)
    return parseDarkmerchCSV(csv)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error reading XLSX file'
    return {
      transactions: [],
      errors: [{ row: 0, reason: `Failed to read XLSX file: ${reason}`, data: '' }],
    }
  }
}

/**
 * Converts an ExcelJS worksheet to a CSV string.
 * Values containing commas, quotes, or newlines are properly quoted.
 */
function worksheetToCSV(worksheet: import('exceljs').Worksheet): string {
  const rows: string[] = []
  worksheet.eachRow({ includeEmpty: true }, row => {
    const values = (row.values as import('exceljs').CellValue[]).slice(1) // index 0 is always undefined
    const csvRow = values.map(cell => {
      const val = cell == null ? '' : String(cell)
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"`
        : val
    })
    rows.push(csvRow.join(','))
  })
  return rows.join('\n')
}
