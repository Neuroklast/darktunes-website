/**
 * src/lib/sos/excelExportError.ts
 *
 * Typed Excel export failures shared by the CSV worker hook, the export hook
 * and the worker protocol — the UI maps `code` to a specific message.
 */

export type ExcelExportWorkerErrorCode =
  | 'EXCEL_TIMEOUT'
  | 'EXCEL_WORKER_NOT_READY'
  | 'EXCEL_WORKER_DATA_MISSING'
  | 'EXCEL_ARTIST_NOT_IN_WORKER'
  | 'EXCEL_RAW_ROWS_LIMIT'

export class ExcelExportWorkerError extends Error {
  readonly code?: string
  readonly rows?: number
  readonly limit?: number

  constructor(
    message: string,
    opts?: { code?: string; rows?: number; limit?: number },
  ) {
    super(message)
    this.name = 'ExcelExportWorkerError'
    this.code = opts?.code
    this.rows = opts?.rows
    this.limit = opts?.limit
  }
}
