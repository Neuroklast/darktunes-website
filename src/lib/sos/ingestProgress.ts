export type SosIngestPhase =
  | 'reading'
  | 'decoding'
  | 'tokenizing'
  | 'parsing'
  | 'aggregating'
  | 'archiving'
  | 'done'
  | 'error'

export interface SosParseProgress {
  fileId: string
  phase: 'tokenizing' | 'parsing'
  percentage: number
  processedRows?: number
  totalRows?: number
}

export interface SosProcessProgress {
  phase: 'aggregating' | 'summaries' | 'finalizing'
  percentage: number
}

export interface SosParseDoneStats {
  fileId: string
  rowsParsed: number
  rowsSkipped: number
  uniqueArtistsCount: number
  emptyCurrencyRows: number
  skipReasons: string[]
  periodStart: string
  periodEnd: string
}

export function formatInteger(n: number): string {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(n)))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function estimateCsvRowCount(text: string): number {
  if (!text) return 0
  let lines = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++
  }
  if (!text.endsWith('\n')) lines++
  return Math.max(0, lines - 1)
}

export function periodBoundsFromMonths(months: string[]): { periodStart: string; periodEnd: string } {
  const valid = months.filter((month) => /^\d{4}-\d{2}$/.test(month)).sort()
  return { periodStart: valid[0] ?? '', periodEnd: valid[valid.length - 1] ?? '' }
}
