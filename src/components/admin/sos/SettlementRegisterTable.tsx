'use client'

import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { SosConfirmDialog } from '@/components/admin/sos/SosConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { AdminDataTable, useAdminTable } from '@/components/admin/DataTable'
import { AccountingListPagination } from './AccountingListPagination'
import {
  canCorrectStatement,
  fmtCents,
  fmtDate,
  fmtEur,
  rowIsSelectable,
  type MasterRow,
} from '@/components/admin/sos/settlementCenterModel'
import {
  WorkflowProgressIcon,
  WorkflowStatusBadge,
} from '@/components/admin/sos/statementWorkflowUi'
import type { SettlementCenterState } from '@/hooks/useSettlementCenter'
import { interpolate } from '@/lib/i18n/interpolate'
import {
  CircleNotch,
    EnvelopeSimple,
    FileArrowUp,
    FilePdf,
  MagnifyingGlass,
  PaperPlaneTilt,
  PencilSimple,
  Trash,
} from '@phosphor-icons/react'

function InvoiceStatusBadge({
  status,
  labels,
}: {
  status: string | undefined
  labels: Record<string, string>
}) {
  if (!status) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const className =
    status === 'paid'
      ? 'bg-emerald-600/90 text-white'
      : status === 'received' || status === 'partially_paid'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
        : status === 'sent'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : undefined

  return (
    <Badge variant="outline" className={className}>
      {labels[status] ?? status}
    </Badge>
  )
}

interface SettlementRegisterTableProps {
  settlement: SettlementCenterState
}

export function SettlementRegisterTable({ settlement }: SettlementRegisterTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<{
    statementId: string
    artistName: string
  } | null>(null)

  const {
    t,
    invoiceStatusLabels,
    periodWritable,
    filter,
    setFilter,
    loading,
    loadError,
    refreshRegister,
    filteredRows,
    selectableRows,
    allSelected,
    selectedArtists,
    toggleSelectAll,
    toggleArtist,
    busyArtists,
    creatingDrafts,
    approving,
    notifying,
    runNotify,
    runDownloadPdf,
    correcting,
    deletingDraft,
    runDraftCreation,
    runApproval,
    runDeleteDraft,
    openCorrectionDialog,
  } = settlement

  const renderRowActions = (row: MasterRow, isBusy: boolean) => (
    <div className="flex flex-wrap gap-2">
      {row.statementId && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void runDownloadPdf(row.statementId!)}
          aria-label={interpolate(t.settlementPdfAria, { artist: row.artistName })}
        >
          <FilePdf size={14} />
          {t.settlementPdfBtn}
        </Button>
      )}
      {row.workflowStatus === 'not_uploaded' && row.artistId && row.payout != null && periodWritable && (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy || creatingDrafts}
          onClick={() => void runDraftCreation([row])}
        >
          {isBusy ? <CircleNotch size={14} className="animate-spin" /> : <FileArrowUp size={14} />}
          {t.settlementDraftBtn}
        </Button>
      )}
      {row.workflowStatus === 'draft' && row.statementId && periodWritable && (
        <>
          <Button size="sm" disabled={approving} onClick={() => void runApproval([row.statementId!])}>
            <PaperPlaneTilt size={14} />
            {t.settlementApproveBtn}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={deletingDraft}
            onClick={() => {
              setDeleteTarget({
                statementId: row.statementId!,
                artistName: row.artistName,
              })
            }}
            aria-label={interpolate(t.settlementDeleteDraftBtn, { artist: row.artistName })}
          >
            <Trash size={14} />
            {t.settlementDeleteDraftBtn}
          </Button>
        </>
      )}
      {row.workflowStatus === 'label_approved' && row.statementId && periodWritable && (
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy || notifying}
          onClick={() => void runNotify(row.statementId!, row.artistName)}
          aria-label={interpolate(t.settlementNotifyAria, { artist: row.artistName })}
        >
          {isBusy ? <CircleNotch size={14} className="animate-spin" /> : <EnvelopeSimple size={14} />}
          {t.settlementNotifyBtn}
        </Button>
      )}
      {canCorrectStatement(row) && periodWritable && (
        <Button
          size="sm"
          variant="outline"
          disabled={correcting}
          onClick={() => openCorrectionDialog(row)}
          aria-label={interpolate(t.settlementCorrectionAria, { artist: row.artistName })}
        >
          <PencilSimple size={14} />
          {t.settlementCorrectionBtn}
        </Button>
      )}
      {(row.workflowStatus === 'artist_notified' ||
        row.workflowStatus === 'acknowledged' ||
        row.workflowStatus === 'label_approved' ||
        row.workflowStatus === 'viewed' ||
        row.workflowStatus === 'invoiced' ||
        row.workflowStatus === 'paid') && <WorkflowProgressIcon complete />}
    </div>
  )

  const columns: ColumnDef<MasterRow>[] = [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleSelectAll}
          aria-label={t.settlementSelectActionableAria}
          disabled={selectableRows.length === 0}
        />
      ),
      enableSorting: false,
      cell: ({ row }) => {
        const actionable = rowIsSelectable(row.original)
        return (
          <Checkbox
            checked={selectedArtists.has(row.original.artistName)}
            onCheckedChange={() => toggleArtist(row.original.artistName)}
            aria-label={interpolate(t.settlementSelectArtist, { artist: row.original.artistName })}
            disabled={!actionable}
          />
        )
      },
    },
    {
      accessorKey: 'artistName',
      header: t.settlementColArtist,
      enableSorting: false,
      cell: ({ row }) => <span className="font-medium">{row.original.artistName}</span>,
    },
    {
      id: 'statement',
      header: t.settlementColStatement,
      enableSorting: false,
      cell: ({ row }) => <WorkflowStatusBadge status={row.original.workflowStatus} />,
    },
    {
      id: 'viewed',
      header: t.settlementColViewed,
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm">{fmtDate(row.original.firstViewedAt)}</span>,
    },
    {
      id: 'invoice',
      header: t.settlementColInvoice,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <InvoiceStatusBadge status={row.original.invoiceStatus} labels={invoiceStatusLabels} />
          {row.original.invoiceNumber && (
            <span className="text-[10px] text-muted-foreground">{row.original.invoiceNumber}</span>
          )}
          {row.original.invoiceDeliveryStatus === 'failed' && (
            <span className="text-[10px] text-amber-400">{t.settlementInvoiceDeliveryFailed}</span>
          )}
        </div>
      ),
    },
    {
      id: 'received',
      header: t.settlementColReceived,
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm">{fmtDate(row.original.receivedAt)}</span>,
    },
    {
      id: 'paid',
      header: t.settlementColPaid,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm">{fmtDate(row.original.paidAt)}</span>
          {row.original.paidAmountCents > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {fmtCents(row.original.paidAmountCents)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'sessionPayout',
      header: () => <span className="text-right block w-full">{t.settlementColSessionPayout}</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums text-muted-foreground">
          {row.original.payout != null ? fmtEur(row.original.payout) : '—'}
        </span>
      ),
    },
    {
      id: 'statementAmount',
      header: () => <span className="text-right block w-full">{t.settlementColStatementAmount}</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const delta =
          row.original.payout != null &&
          row.original.statementAmountEur != null &&
          Math.abs(row.original.payout - row.original.statementAmountEur) >= 0.01
        return (
          <span
            className={`block text-right tabular-nums ${delta ? 'text-amber-300' : ''}`}
            title={delta ? 'Session payout differs from statement amount' : undefined}
          >
            {row.original.statementAmountEur != null ? fmtEur(row.original.statementAmountEur) : '—'}
          </span>
        )
      },
    },
    {
      id: 'balance',
      header: () => <span className="text-right block w-full">{t.settlementColOpenBalance}</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <span
          className={`block text-right tabular-nums ${
            row.original.ledgerBalanceEur > 0
              ? 'text-amber-300'
              : row.original.ledgerBalanceEur < 0
                ? 'text-sky-300'
                : ''
          }`}
        >
          {fmtEur(row.original.ledgerBalanceEur)}
        </span>
      ),
    },
    {
      id: 'carryForward',
      header: () => <span className="text-right block w-full">{t.settlementColCarryForward}</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums text-muted-foreground">
          {row.original.carryForwardEur != null ? fmtEur(row.original.carryForwardEur) : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="text-right block w-full">{t.settlementColActions}</span>,
      enableSorting: false,
      cell: ({ row }) =>
        renderRowActions(row.original, busyArtists.has(row.original.artistName)),
    },
  ]

  const table = useAdminTable({
    data: filteredRows,
    columns,
    pageSize: 10,
    enableSorting: false,
    getRowId: (row) => row.artistName,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filter}
            onChange={(event) => { setFilter(event.target.value); table.setPageIndex(0) }}
            placeholder={t.settlementFilterPlaceholder}
            className="pl-8 h-9"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={toggleSelectAll} disabled={selectableRows.length === 0}>
          {allSelected ? t.settlementDeselectAll : t.settlementSelectActionable}
        </Button>
      </div>

      {loadError && (
        <div
          className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm text-destructive">{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void refreshRegister()} disabled={loading}>
            {t.settlementRegisterRetry}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain border-b border-border p-3 lg:hidden" data-lenis-prevent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.settlementLoadingRegister}</p>
        ) : loadError && filteredRows.length === 0 ? null : filteredRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.settlementNoArtistsFilter}</p>
        ) : (
          table.getRowModel().rows.map(({ original: row }) => {
            const actionable = rowIsSelectable(row)
            const isBusy = busyArtists.has(row.artistName)
            return (
              <div key={row.artistName} className="rounded-lg border border-border bg-card/30 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.artistName}</p>
                    <WorkflowStatusBadge status={row.workflowStatus} />
                  </div>
                  {actionable && (
                    <Checkbox
                      checked={selectedArtists.has(row.artistName)}
                      onCheckedChange={() => toggleArtist(row.artistName)}
                      aria-label={interpolate(t.settlementSelectArtist, { artist: row.artistName })}
                    />
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{t.settlementColViewed}</dt>
                    <dd>{fmtDate(row.firstViewedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t.settlementColInvoice}</dt>
                    <dd>
                      <InvoiceStatusBadge status={row.invoiceStatus} labels={invoiceStatusLabels} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t.settlementColOpenBalance}</dt>
                    <dd className="tabular-nums">{fmtEur(row.ledgerBalanceEur)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t.settlementColCarryForward}</dt>
                    <dd className="tabular-nums">
                      {row.carryForwardEur != null ? fmtEur(row.carryForwardEur) : '—'}
                    </dd>
                  </div>
                </dl>
                {renderRowActions(row, isBusy)}
              </div>
            )
          })
        )}
      </div>

      <div className="hidden min-h-0 flex-1 overflow-auto lg:block" data-lenis-prevent>
        <AdminDataTable
          table={table}
          loading={loading}
          emptyMessage={loadError ? loadError : t.settlementNoArtistsFilter}
          skeletonRowCount={6}
          stickyHeader
        />
      </div>

      <div className="shrink-0 px-4 py-2">
        <AccountingListPagination count={filteredRows.length}
          page={Math.min(table.getState().pagination.pageIndex, Math.max(0, table.getPageCount() - 1))}
          pageSize={10} onPageChange={index => table.setPageIndex(index)} />
      </div>
      <SosConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={t.settlementDeleteDraftBtn}
        description={
          deleteTarget
            ? interpolate(t.settlementDeleteDraftConfirm, { artist: deleteTarget.artistName })
            : ''
        }
        confirmLabel={t.settlementDeleteDraftBtn}
        cancelLabel={t.uiCancel}
        destructive
        loading={deletingDraft}
        onConfirm={() => {
          if (!deleteTarget) return
          void runDeleteDraft(deleteTarget.statementId, deleteTarget.artistName).finally(() => {
            setDeleteTarget(null)
          })
        }}
      />
    </div>
  )
}