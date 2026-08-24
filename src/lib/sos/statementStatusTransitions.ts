import type { Database } from '@/types/database'

export type SalesStatementStatus = Database['public']['Tables']['sales_statements']['Row']['status']

/**
 * Allowed FROM → TO edges for sales_statements.status.
 * Invoice may skip notified/viewed (label practice). Payment may skip invoice
 * received (handled on artist_invoices). No reverse / unlock / unpay.
 *
 * invoiced/acknowledged may go to superseded so a correction of an already
 * invoiced statement can replace it on approve.
 */
export const STATEMENT_TRANSITIONS: Record<SalesStatementStatus, readonly SalesStatementStatus[]> = {
  draft: ['label_approved', 'cancelled'],
  label_approved: ['artist_notified', 'viewed', 'invoiced', 'cancelled', 'superseded'],
  artist_notified: ['viewed', 'invoiced', 'cancelled', 'superseded'],
  viewed: ['invoiced', 'paid', 'cancelled', 'superseded'],
  invoiced: ['paid', 'cancelled', 'superseded'],
  paid: [],
  acknowledged: ['paid', 'cancelled', 'superseded'],
  superseded: [],
  cancelled: [],
}

export class InvalidStatementTransitionError extends Error {
  readonly from: SalesStatementStatus
  readonly to: SalesStatementStatus

  constructor(from: SalesStatementStatus, to: SalesStatementStatus) {
    super(`Cannot change statement status from "${from}" to "${to}"`)
    this.name = 'InvalidStatementTransitionError'
    this.from = from
    this.to = to
  }
}

export function canTransitionStatementStatus(
  from: SalesStatementStatus,
  to: SalesStatementStatus,
): boolean {
  if (from === to) return true
  return STATEMENT_TRANSITIONS[from].includes(to)
}

export function assertStatementTransition(
  from: SalesStatementStatus,
  to: SalesStatementStatus,
): void {
  if (!canTransitionStatementStatus(from, to)) {
    throw new InvalidStatementTransitionError(from, to)
  }
}
