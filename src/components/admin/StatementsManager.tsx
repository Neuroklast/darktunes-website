'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AdminDataTable, useAdminTable } from '@/components/admin/DataTable'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { getAdminAccessToken } from '@/lib/admin/getAccessToken'
import type { SalesStatementStatus } from '@/lib/api/salesStatements'
import {
  deriveActiveWorkflowStep,
  deriveCompletedWorkflowSteps,
  emptyWorkflowStatusCounts,
  workflowStatusFromStatement,
  type ArtistStatementWorkflowStatus,
} from '@/lib/sos/statementWorkflow'
import {
  WorkflowStatusBadge,
  WorkflowStepper,
  WorkflowSummaryCard,
} from '@/components/admin/sos/statementWorkflowUi'
import { SosConfirmDialog } from '@/components/admin/sos/SosConfirmDialog'
import { CircleNotch, PaperPlaneTilt, SealCheck, Trash } from '@phosphor-icons/react'
import { deleteSalesStatement } from '@/lib/api/settlementCenterApi'
import { useMergedAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'
import { PUBLIC_QUERY_LIMITS } from '@/lib/api/queryLimits'
import { artistNameFromEmbed } from '@/lib/sos/statementArtistName'

type StatementRow = {
  id: string
  artist_id: string
  filename: string
  period: string
  amount_eur: number | null
  status: SalesStatementStatus
  label_notes: string | null
  created_at: string
  artists: { name: string }
}

const STATEMENTS_FALLBACK = {
  historyReadOnlyTitle: 'Read-only history',
  historyReadOnlyBody:
    'Approve statements, record payments, and manage invoices in Settlement Center — not here.',
  historyManageInSettlement: 'Manage in Settlement Center',
  historyDraftPending: '{count} draft(s) awaiting approval in Settlement Center',
  historyTitle: 'Statement History',
  historyDescriptionReadOnly:
    'All uploaded statements with approval status. Approvals and payments happen in Settlement Center.',
  historyDescriptionEditable:
    'All uploaded statements with approval status. For the full settlement workflow, use Settlement Center in Accounting.',
  historyLoadingAria: 'Loading statements',
  historyLoadError: 'Could not load statements',
  historyEmpty: 'No statements uploaded yet.',
  historySuperseded: 'Superseded',
  historyApprove: 'Approve',
  historyApproveSuccess: '{approved} statement(s) approved{emailed}',
  historyApproveEmailed: ', {emailed} notification(s) sent',
  historyApproveFailed: 'Approval failed',
  historySessionExpired: 'Session expired',
  historyFilterPlaceholder: 'Filter by artist, period, or filename…',
  historySelectAllDrafts: 'Select all drafts',
  historyApproveSelection: 'Approve selection ({count})',
  historyApproveAllDrafts: 'All drafts ({count})',
  historyColArtist: 'Artist',
  historyColPeriod: 'Period',
  historyColStatus: 'Status',
  historyColAmount: 'Amount',
  historyColFilename: 'Filename',
  historyColCreated: 'Created',
  historyColActions: 'Actions',
  historySelectArtist: 'Select {artist}',
  historySelectColumn: 'Selection',
  historyKpiDraftPending: 'Approval pending',
  historyKpiDraftHint: 'Drafts',
  historyKpiNotified: 'Notified',
  historyKpiNotifiedHint: 'Email sent',
  historyKpiViewed: 'Viewed',
  historyKpiViewedHint: 'Opened in portal',
  historyKpiInvoiced: 'Invoice',
  historyKpiInvoicedHint: 'Invoice created',
  historyKpiPaid: 'Paid',
  historyKpiPaidHint: 'Complete',
  historyKpiSuperseded: 'Superseded',
  historyKpiSupersededHint: 'Replaced by correction',
  settlementDeleteDraftBtn: 'Delete draft',
  settlementDeleteDraftSuccess: 'Draft deleted for {artist}',
  settlementDeleteDraftFailed: 'Failed to delete draft for {artist}',
  settlementDeleteDraftConfirm: 'Delete draft statement for {artist}? This cannot be undone.',
  commonCancel: 'Cancel',
} as const

function formatEur(amount: number | null): string {
  if (amount === null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function statementArtistName(statement: { artists?: unknown }): string {
  return artistNameFromEmbed(statement.artists)
}

interface StatementsManagerProps {
  /** When true (default), hides approve actions — use Settlement Center instead. */
  readOnly?: boolean
  /** Deep link to Settlement Center tab in Accounting. */
  settlementHref?: string
  /**
   * When true, suppresses the internal read-only banner (use when the parent
   * page already provides its own CTA, e.g. app/admin/statements/page.tsx).
   */
  hideReadOnlyBanner?: boolean
}

export function StatementsManager({
  readOnly = true,
  settlementHref = '/admin/accounting?guidedStep=settle',
  hideReadOnlyBanner = false,
}: StatementsManagerProps) {
  const t = useMergedAccountingLabels(STATEMENTS_FALLBACK)

  const [statements, setStatements] = useState<StatementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    artistName: string
  } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')

  const fetchStatements = useCallback(async () => {
    setLoading(true)
    setError(null)

    const supabase = createBrowserSupabaseClient()
    const { data, error: fetchError } = await supabase
      .from('sales_statements')
      .select(`
        id,
        artist_id,
        filename,
        period,
        amount_eur,
        status,
        label_notes,
        created_at,
        artists!inner(name)
      `)
      .order('created_at', { ascending: false })
      .limit(PUBLIC_QUERY_LIMITS.statementsAdmin)

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setStatements((data ?? []) as StatementRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchStatements()
  }, [fetchStatements])

  const filteredStatements = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return statements
    return statements.filter(
      (statement) =>
        statementArtistName(statement).toLowerCase().includes(query) ||
        statement.period.toLowerCase().includes(query) ||
        statement.filename.toLowerCase().includes(query),
    )
  }, [statements, filter])

  const counts = useMemo(() => {
    return statements.reduce((acc, statement) => {
      const workflowStatus = workflowStatusFromStatement(statement.status, true)
      acc[workflowStatus] += 1
      return acc
    }, emptyWorkflowStatusCounts())
  }, [statements])

  const workflowProgress = useMemo(
    () => ({
      rowCount: statements.length,
      counts,
    }),
    [statements.length, counts],
  )

  const activeStep = useMemo(
    () => deriveActiveWorkflowStep(workflowProgress),
    [workflowProgress],
  )
  const completedSteps = useMemo(
    () => deriveCompletedWorkflowSteps(workflowProgress),
    [workflowProgress],
  )

  const draftIds = filteredStatements
    .filter((statement) => statement.status === 'draft')
    .map((s) => s.id)
  const selectedDraftIds = Array.from(selectedIds).filter((id) =>
    filteredStatements.some((statement) => statement.id === id && statement.status === 'draft'),
  )

  const handleDeleteDraft = async (statementId: string, artistName: string) => {
    setDeletingId(statementId)
    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.historySessionExpired)
      await deleteSalesStatement(
        token,
        statementId,
        interpolate(t.settlementDeleteDraftFailed, { artist: artistName }),
      )
      await fetchStatements()
      toast.success(interpolate(t.settlementDeleteDraftSuccess, { artist: artistName }))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : interpolate(t.settlementDeleteDraftFailed, { artist: artistName }),
      )
    } finally {
      setDeletingId(null)
    }
  }

  const handleApprove = async (statementIds: string[]) => {
    if (readOnly || statementIds.length === 0) return
    setApproving(true)

    try {
      const token = await getAdminAccessToken()
      if (!token) throw new Error(t.historySessionExpired)

      const response = await fetch('/api/admin/sales-statements/bulk-approve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: statementIds }),
      })

      const json = (await response.json().catch(() => null)) as
        | { approved?: number; emailed?: number; error?: string }
        | null

      if (!response.ok) {
        throw new Error(json?.error ?? t.historyApproveFailed)
      }

      await fetchStatements()
      setSelectedIds(new Set())

      const emailedSuffix =
        (json?.emailed ?? 0) > 0
          ? interpolate(t.historyApproveEmailed, { emailed: json?.emailed ?? 0 })
          : ''

      toast.success(
        interpolate(t.historyApproveSuccess, {
          approved: json?.approved ?? 0,
          emailed: emailedSuffix,
        }),
      )
    } catch (approvalError) {
      toast.error(
        approvalError instanceof Error ? approvalError.message : t.historyApproveFailed,
      )
    } finally {
      setApproving(false)
    }
  }

  const renderStatementActions = (
    statement: StatementRow,
    workflowStatus: ArtistStatementWorkflowStatus,
  ) => {
    const isDraft = statement.status === 'draft'

    if (readOnly) {
      return (
        <div className="flex flex-wrap justify-end gap-2">
          {isDraft && (
            <>
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <Link href={settlementHref}>{t.historyManageInSettlement}</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-destructive border-destructive/40"
                disabled={deletingId === statement.id}
                onClick={() => setDeleteTarget({ id: statement.id, artistName: statementArtistName(statement) })}
              >
                {deletingId === statement.id ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : (
                  <Trash size={14} />
                )}
                {t.settlementDeleteDraftBtn}
              </Button>
            </>
          )}
          {workflowStatus === 'superseded' && (
            <span className="text-xs text-muted-foreground self-center">{t.historySuperseded}</span>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-wrap justify-end gap-2">
        {isDraft && (
          <Button
            disabled={approving}
            onClick={() => void handleApprove([statement.id])}
            size="sm"
            className="gap-1"
          >
            {approving ? <CircleNotch size={14} className="animate-spin" /> : <PaperPlaneTilt size={14} />}
            {t.historyApprove}
          </Button>
        )}
        {workflowStatus === 'superseded' && (
          <span className="text-xs text-muted-foreground self-center">{t.historySuperseded}</span>
        )}
      </div>
    )
  }

  const columns: ColumnDef<StatementRow>[] = [
    ...(!readOnly
      ? [
          {
            id: 'select',
            header: t.historySelectColumn,
            enableSorting: false,
            cell: ({ row }: { row: { original: StatementRow } }) => {
              const isDraft = row.original.status === 'draft'
              return (
                <Checkbox
                  checked={selectedIds.has(row.original.id)}
                  onCheckedChange={() => {
                    setSelectedIds((current) => {
                      const next = new Set(current)
                      if (next.has(row.original.id)) next.delete(row.original.id)
                      else next.add(row.original.id)
                      return next
                    })
                  }}
                  aria-label={interpolate(t.historySelectArtist, {
                    artist: statementArtistName(row.original),
                  })}
                  disabled={!isDraft}
                />
              )
            },
          } satisfies ColumnDef<StatementRow>,
        ]
      : []),
    {
      id: 'artist',
      header: t.historyColArtist,
      enableSorting: false,
      cell: ({ row }) => statementArtistName(row.original),
    },
    {
      accessorKey: 'period',
      header: t.historyColPeriod,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-mono text-sm">{row.original.period}</span>
      ),
    },
    {
      id: 'status',
      header: t.historyColStatus,
      enableSorting: false,
      cell: ({ row }) => (
        <WorkflowStatusBadge status={workflowStatusFromStatement(row.original.status, true)} />
      ),
    },
    {
      accessorKey: 'amount_eur',
      header: () => <span className="text-right block w-full">{t.historyColAmount}</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums whitespace-nowrap">
          {formatEur(row.original.amount_eur)}
        </span>
      ),
    },
    {
      accessorKey: 'filename',
      header: t.historyColFilename,
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.filename}</span>,
    },
    {
      accessorKey: 'created_at',
      header: t.historyColCreated,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="text-right block w-full">{t.historyColActions}</span>,
      enableSorting: false,
      cell: ({ row }) =>
        renderStatementActions(
          row.original,
          workflowStatusFromStatement(row.original.status, true),
        ),
    },
  ]

  const table = useAdminTable({
    data: filteredStatements,
    columns,
    enableSorting: false,
    getRowId: (row) => row.id,
  })

  if (loading) {
    return (
      <div aria-busy="true" aria-label={t.historyLoadingAria} className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {t.historyLoadError}: {error}
      </p>
    )
  }

  if (statements.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">{t.historyEmpty}</p>
    )
  }

  return (
    <div className="space-y-6">
      {readOnly && !hideReadOnlyBanner && (
        <Alert className="border-primary/30 bg-primary/5">
          <SealCheck size={16} className="text-primary" />
          <AlertTitle className="text-sm">{t.historyReadOnlyTitle}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span>{t.historyReadOnlyBody}</span>
            <Button size="sm" className="shrink-0" asChild>
              <Link href={settlementHref}>{t.historyManageInSettlement}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t.historyTitle}</h2>
        <p className="text-sm text-muted-foreground max-w-3xl">
          {readOnly ? t.historyDescriptionReadOnly : t.historyDescriptionEditable}
        </p>
        {readOnly && counts.draft > 0 && (
          <p className="text-xs text-amber-400">
            {interpolate(t.historyDraftPending, { count: counts.draft })}
          </p>
        )}
      </div>

      <WorkflowStepper activeStep={activeStep} completedSteps={completedSteps} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <WorkflowSummaryCard
          label={t.historyKpiDraftPending}
          value={counts.draft}
          hint={t.historyKpiDraftHint}
          tone={counts.draft > 0 ? 'warning' : 'muted'}
        />
        <WorkflowSummaryCard
          label={t.historyKpiNotified}
          value={counts.artist_notified}
          hint={t.historyKpiNotifiedHint}
        />
        <WorkflowSummaryCard
          label={t.historyKpiViewed}
          value={counts.viewed}
          hint={t.historyKpiViewedHint}
        />
        <WorkflowSummaryCard
          label={t.historyKpiInvoiced}
          value={counts.invoiced + counts.acknowledged}
          hint={t.historyKpiInvoicedHint}
        />
        <WorkflowSummaryCard
          label={t.historyKpiPaid}
          value={counts.paid}
          hint={t.historyKpiPaidHint}
          tone={counts.paid > 0 ? 'success' : 'muted'}
        />
        <WorkflowSummaryCard
          label={t.historyKpiSuperseded}
          value={counts.superseded}
          hint={t.historyKpiSupersededHint}
          tone="muted"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 lg:flex-row lg:items-center lg:justify-between">
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t.historyFilterPlaceholder}
          className="w-full lg:max-w-md"
        />
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={draftIds.length === 0}
              onClick={() => setSelectedIds(new Set(draftIds))}
            >
              {t.historySelectAllDrafts}
            </Button>
            <Button
              className="gap-2"
              disabled={approving || selectedDraftIds.length === 0}
              onClick={() => void handleApprove(selectedDraftIds)}
            >
              {approving ? <CircleNotch size={16} className="animate-spin" /> : <PaperPlaneTilt size={16} />}
              {interpolate(t.historyApproveSelection, { count: selectedDraftIds.length })}
            </Button>
            <Button
              variant="secondary"
              className="gap-2"
              disabled={approving || counts.draft === 0}
              onClick={() => void handleApprove(draftIds)}
            >
              <SealCheck size={16} />
              {interpolate(t.historyApproveAllDrafts, { count: counts.draft })}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {filteredStatements.map((statement) => {
          const workflowStatus = workflowStatusFromStatement(statement.status, true)
          const isDraft = statement.status === 'draft'

          return (
            <div
              key={statement.id}
              className="rounded-xl border border-border bg-card/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{statementArtistName(statement)}</p>
                  <p className="text-sm text-muted-foreground font-mono">{statement.period}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <WorkflowStatusBadge status={workflowStatus} />
                <span className="text-sm tabular-nums">{formatEur(statement.amount_eur)}</span>
                {readOnly && isDraft && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-400">
                    {t.historyManageInSettlement}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate font-mono">{statement.filename}</p>
              <p className="text-xs text-muted-foreground">{formatDate(statement.created_at)}</p>
              {statement.label_notes && (
                <p className="text-xs text-muted-foreground italic">{statement.label_notes}</p>
              )}
              {renderStatementActions(statement, workflowStatus)}
            </div>
          )
        })}
      </div>

      <div className="hidden md:block rounded-xl border border-border overflow-hidden">
        <AdminDataTable table={table} emptyMessage={t.historyEmpty} />
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
        cancelLabel={t.commonCancel}
        destructive
        loading={deletingId != null}
        onConfirm={() => {
          if (!deleteTarget) return
          void handleDeleteDraft(deleteTarget.id, deleteTarget.artistName).finally(() => {
            setDeleteTarget(null)
          })
        }}
      />
    </div>
  )
}