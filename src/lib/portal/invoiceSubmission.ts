/**
 * src/lib/portal/invoiceSubmission.ts
 *
 * Shared client types/helpers for POST /api/portal/invoices responses.
 * The endpoint reports mail delivery and post-insert follow-up failures as
 * `warnings` instead of silently claiming success.
 */

export interface InvoiceEmailResult {
  sent: boolean
  error?: string
}

export interface InvoiceSubmitMeta {
  warnings: string[]
  email: {
    client?: InvoiceEmailResult
    label?: InvoiceEmailResult
  }
}

export interface InvoiceSubmitPayload {
  warnings?: string[]
  email?: {
    client?: InvoiceEmailResult
    label?: InvoiceEmailResult
  }
}

export function invoiceSubmitMeta(payload: InvoiceSubmitPayload): InvoiceSubmitMeta {
  return {
    warnings: payload.warnings ?? [],
    email: payload.email ?? {},
  }
}

/** True when at least one requested invoice mail was not delivered. */
export function invoiceEmailFailed(meta: InvoiceSubmitMeta): boolean {
  return meta.email.client?.sent === false || meta.email.label?.sent === false
}

export function invoiceEmailError(meta: InvoiceSubmitMeta): string | undefined {
  return meta.email.client?.error ?? meta.email.label?.error
}

const FOLLOW_UP_WARNINGS = [
  'statement_status_failed',
  'ledger_entry_failed',
  'notify_failed',
  'recovered_partial',
] as const

/** Warnings that indicate a follow-up step failed (excluding mail + replay). */
export function invoiceFollowUpWarning(meta: InvoiceSubmitMeta): boolean {
  return meta.warnings.some((warning) =>
    (FOLLOW_UP_WARNINGS as readonly string[]).includes(warning),
  )
}
