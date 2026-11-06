/**
 * Only a small preview may leave the browser for semantic import assistance.
 * Large CSV files are never loaded into memory merely to identify a format.
 */
import Papa from 'papaparse'

export interface ImportSample {
  headers: string[]
  sampleRows: string[][]
  delimiter: ',' | ';' | '\t'
}

const CSV_PREVIEW_BYTES = 256 * 1024

/** Order-insensitive header signature, independent of filename and row values. */
export function fingerprintHeaders(headers: string[]): string {
  return headers.map((h) => h.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' '))
    .filter(Boolean).sort().join('\u001f')
}

/** Parses at most three data rows. The rest of the source is discarded here. */
export function parseImportSample(content: string): ImportSample {
  const parsed = Papa.parse<string[]>(content.replace(/^\uFEFF/, ''), {
    preview: 4,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  })
  const rows = parsed.data.filter((row) => row.some((cell) => String(cell ?? '').trim()))
  const headers = (rows[0] ?? []).map((h) => String(h ?? '').trim())
  if (!headers.length || !headers.some(Boolean)) throw new Error('No CSV column headers found.')
  const delimiter = parsed.meta.delimiter === ';' || parsed.meta.delimiter === '\t'
    ? parsed.meta.delimiter : ','
  return {
    headers: headers.slice(0, 80),
    sampleRows: rows.slice(1, 4).map((row) =>
      headers.slice(0, 80).map((_, i) => String(row[i] ?? '').slice(0, 160)),
    ),
    delimiter,
  }
}

/** Redact obvious personal/contact identifiers before a sample leaves the browser. */
export function sanitizeAiSample(sample: ImportSample): ImportSample {
  const sensitiveHeader = /(?:e-?mail|iban|swift|bic|address|adresse|street|phone|telefon|mobile|customer|buyer|recipient|contact|invoice|tax.?id|account.?holder|first.?name|last.?name|full.?name|person)/i
  return {
    ...sample,
    sampleRows: sample.sampleRows.slice(0, 3).map((row) =>
      sample.headers.map((header, i) => {
        if (sensitiveHeader.test(header)) return '[redacted]'
        return (row[i] ?? '')
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
          .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi, '[redacted]')
          .replace(/\+?\d[\d\s()./-]{8,}\d/g, '[redacted]')
      }),
    ),
  }
}

export async function readImportSample(file: File): Promise<ImportSample> {
  if (/\.xlsx$/i.test(file.name)) {
    // XLSX is compressed; reading its workbook locally is unavoidable.
    // Never send the workbook or its other rows to the AI.
    const ExcelJS = await import('exceljs')
    const buffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(buffer) as never)
    const sheet = workbook.worksheets.find((item) => item.actualRowCount > 0)
    if (!sheet) throw new Error('The spreadsheet contains no data.')
    const values: string[][] = []
    for (let rowIndex = 1; rowIndex <= sheet.rowCount && values.length < 4; rowIndex++) {
      const row = sheet.getRow(rowIndex)
      const cells = (row.values as import('exceljs').CellValue[]).slice(1).map((cell) =>
        cell == null ? '' : typeof cell === 'object' ? String('text' in cell ? cell.text : 'result' in cell ? cell.result : '') : String(cell),
      )
      if (cells.some((cell) => cell.trim())) values.push(cells)
    }
    const headers = (values[0] ?? []).map((h) => h.trim()).slice(0, 80)
    if (!headers.length) throw new Error('The spreadsheet has no header row.')
    return {
      headers,
      sampleRows: values.slice(1, 4).map((row) => headers.map((_, i) => (row[i] ?? '').slice(0, 160))),
      delimiter: ',',
    }
  }
  const chunk = await file.slice(0, CSV_PREVIEW_BYTES).arrayBuffer()
  const first = new Uint8Array(chunk, 0, Math.min(2, chunk.byteLength))
  const encoding = first[0] === 0xFF && first[1] === 0xFE ? 'utf-16le'
    : first[0] === 0xFE && first[1] === 0xFF ? 'utf-16be' : 'utf-8'
  return parseImportSample(new TextDecoder(encoding).decode(chunk))
}

// This is used ONLY after the user confirms an XLSX import, never for AI.
export async function readXlsxAsCsv(file: File): Promise<File> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as never)
  const sheet = wb.worksheets.find((ws) => ws.actualRowCount > 0)
  if (!sheet) throw new Error('The spreadsheet contains no rows.')
  const rows: string[][] = []
  for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
    const row = sheet.getRow(rowIndex)
    const cells = (row.values as import('exceljs').CellValue[]).slice(1).map((value) => {
      if (value == null) return ''
      if (value instanceof Date) return value.toISOString().slice(0, 10)
      if (typeof value !== 'object') return String(value)
      if ('text' in value && typeof value.text === 'string') return value.text
      if ('result' in value && value.result != null) return String(value.result)
      if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('')
      return ''
    })
    if (cells.some((cell) => cell.trim())) rows.push(cells)
  }
  if (!rows.length) throw new Error('The spreadsheet contains no data.')
  const csv = Papa.unparse(rows, { header: false })
  return new File([csv], file.name.replace(/\.xlsx$/i, '.csv'), { type: 'text/csv' })
}
