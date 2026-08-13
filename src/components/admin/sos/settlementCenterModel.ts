import type { SettlementRegisterRow } from '@/lib/api/settlementRegister'
import type { SalesStatementStatus } from '@/lib/api/salesStatements'
import {
  SETTLEMENT_FALLBACK,
  type SettlementFallbackLabels,
} from '@/lib/i18n/accountingFallbacks'
import type { TerritoryMetricRow } from '@/lib/sos/data-processor'
import type { MerchOrderRow } from '@/lib/sos/merchOrderRows'
import {
  workflowStatusFromStatement,
  type ArtistStatementWorkflowStatus,
} from '@/lib/sos/statementWorkflow'
import type { ArtistRevenue, LabelArtist } from '@/lib/sos/types'

export interface SettlementCenterPanelProps {
  revenues: ArtistRevenue[]
  labelArtists: LabelArtist[]
  periodStart: string
  periodEnd: string
  territoryMetrics?: TerritoryMetricRow[]
  merchOrderRows?: MerchOrderRow[]
  bronzeBatchIds?: string[]
  persistDisabled?: boolean
  onCreateDraft: (artist: string) => Promise<void>
  onBuildCorrectionPdf?: (artistName: string, amountEur: number) => Promise<string | null>
}

export type MasterRow = {
  artistName: string
  artistId: string | null
  workflowStatus: ArtistStatementWorkflowStatus
  statementId?: string
  firstViewedAt?: string
  invoiceId?: string
  invoiceStatus?: string
  invoiceNumber?: string
  receivedAt?: string
  paidAt?: string
  paidAmountCents: number
  outstandingAmountCents?: number
  ledgerBalanceEur: number
  carryForwardEur?: number
  statementAmountEur?: number
  payout?: number
}

export const CORRECTABLE_WORKFLOW_STATUSES: ArtistStatementWorkflowStatus[] = [
  'label_approved',
  'artist_notified',
  'viewed',
  'invoiced',
  'acknowledged',
]

export function canCorrectStatement(row: MasterRow): boolean {
  return !!row.statementId && CORRECTABLE_WORKFLOW_STATUSES.includes(row.workflowStatus)
}

export type PaymentMethod = 'sepa' | 'paypal' | 'manual' | 'other'

export { SETTLEMENT_FALLBACK, type SettlementFallbackLabels }
export type SettlementLabels = import('@/lib/i18n/accountingFallbacks').AccountingLabels

export function buildInvoiceStatusLabels(
  t: Partial<Record<keyof SettlementFallbackLabels, string>>,
) {
  return {
    draft: t.settlementInvoiceDraft ?? SETTLEMENT_FALLBACK.settlementInvoiceDraft,
    sent: t.settlementInvoiceSent ?? SETTLEMENT_FALLBACK.settlementInvoiceSent,
    received: t.settlementInvoiceReceived ?? SETTLEMENT_FALLBACK.settlementInvoiceReceived,
    partially_paid: t.settlementInvoicePartial ?? SETTLEMENT_FALLBACK.settlementInvoicePartial,
    paid: t.settlementInvoicePaid ?? SETTLEMENT_FALLBACK.settlementInvoicePaid,
    cancelled: t.settlementInvoiceCancelled ?? SETTLEMENT_FALLBACK.settlementInvoiceCancelled,
  }
}

export function buildPeriodStatusLabels(
  t: Partial<Record<keyof SettlementFallbackLabels, string>>,
) {
  return {
    open: t.settlementPeriodOpen ?? SETTLEMENT_FALLBACK.settlementPeriodOpen,
    under_review: t.settlementPeriodReview ?? SETTLEMENT_FALLBACK.settlementPeriodReview,
    approved: t.settlementPeriodApproved ?? SETTLEMENT_FALLBACK.settlementPeriodApproved,
    locked: t.settlementPeriodLocked ?? SETTLEMENT_FALLBACK.settlementPeriodLocked,
    archived: t.settlementPeriodArchived ?? SETTLEMENT_FALLBACK.settlementPeriodArchived,
  }
}

export function fmtEur(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

export function fmtCents(cents: number) {
  return fmtEur(cents / 100)
}

export function fmtDate(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function computeNextPeriod(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00`)
  const end = new Date(`${periodEnd}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { start: '', end: '' }
  }
  const durationMs = end.getTime() - start.getTime()
  const nextStart = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  const nextEnd = new Date(nextStart.getTime() + durationMs)
  if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
    return { start: '', end: '' }
  }
  return { start: toIsoDate(nextStart), end: toIsoDate(nextEnd) }
}

export function registerToMasterRow(row: SettlementRegisterRow): MasterRow {
  return {
    artistName: row.artistName,
    artistId: row.artistId,
    workflowStatus: workflowStatusFromStatement(
      row.statementStatus as SalesStatementStatus | undefined,
      true,
    ),
    statementId: row.statementId,
    firstViewedAt: row.firstViewedAt,
    invoiceId: row.invoiceId,
    invoiceStatus: row.invoiceStatus,
    invoiceNumber: row.invoiceNumber,
    receivedAt: row.receivedAt,
    paidAt: row.paidAt,
    paidAmountCents: row.paidAmountCents,
    outstandingAmountCents: row.outstandingAmountCents,
    ledgerBalanceEur: row.ledgerBalanceEur,
    carryForwardEur: row.carryForwardEur,
    statementAmountEur: row.statementAmountEur,
  }
}

export function rowIsSelectable(row: MasterRow) {
  return (
    (row.workflowStatus === 'not_uploaded' && !!row.artistId && row.payout != null) ||
    (row.workflowStatus === 'draft' && !!row.statementId) ||
    (!!row.invoiceId && !row.receivedAt && row.invoiceStatus === 'sent') ||
    (!!row.invoiceId && row.invoiceStatus !== 'paid' && row.invoiceStatus !== 'cancelled')
  )
}