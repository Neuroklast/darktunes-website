'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { ArtistPayoutBreakdown } from '@/components/admin/sos/ArtistPayoutBreakdown'
import { AccountingListPagination, useAccountingAdaptivePageSize } from './AccountingListPagination'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  DownloadSimple,
  FileText,
  Table as TableIcon,
  Archive,
  MagnifyingGlass,
  EnvelopeSimple,
  SealCheck,
  ArrowRight,
} from '@phosphor-icons/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { useMergedAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import {
  AdminResizableDataTable,
  useResizableAdminTable,
} from '@/components/admin/DataTable'
import type { ArtistRevenue, LabelArtist, LabelInfo, AppDefaults, EmailConfig, SplitFee } from '@/lib/sos/types'
import { buildMailtoLink } from '@/lib/sos/utils'

interface ReportingPanelProps {
  revenues: ArtistRevenue[]
  onDownloadPDF: (artist: string) => void
  onDownloadExcel: (artist: string) => void
  onDownloadAll: () => void
  onDownloadSelected: (artistNames: string[]) => void
  labelArtists?: LabelArtist[]
  labelInfo?: LabelInfo
  appDefaults?: Partial<AppDefaults>
  splitFees?: SplitFee[]
  emailConfig?: Partial<EmailConfig>
  periodStart?: string
  periodEnd?: string
  onGoToSettlementCenter?: () => void
  /** Disables exports while the CSV worker is processing or still busy. */
  disabled?: boolean
}

const ARTIST_CELL_RESERVED_PX = 32

function fmtEur(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

const reportingFallback = {
  reportingSettlementAlertTitle: 'Use Settlement Center for portal publishing',
  reportingSettlementAlertBody:
    'Review payouts here, then open Settlement Center to create draft statements, approve them, and notify artists.',
  reportingSettlementCta: 'Open Settlement Center',
  reportingColArtist: 'Artist',
  reportingColRevenue: 'Total Revenue',
  reportingColPayout: 'Period payout',
  reportingColOpening: 'Opening',
  reportingColDue: 'Amount due',
  reportingNoEmailTemplate:
    'No email template configured. Add one under Branding → Email template.',
  reportingSummaryGross: 'Total gross revenue',
  reportingSummaryPayout: 'Total period payouts',
  reportingSummaryDue: 'Total amount due',
  reportingSummaryExpenses: 'Expenses',
  reportingSummaryFee: 'Distribution fees',
  reportingSummaryNegative: 'Artists with negative payouts: {count}',
  reportingFilteredCount: '{shown} of {total} artists',
  reportingSelectionCount: '{count} artists selected',
  reportingSelectionEmpty: 'No artists selected',
  reportingSelectAll: 'Select all matching artists',
  reportingDeselectAll: 'Deselect matching artists',
  reportingExportSelected: 'Export selected to ZIP',
  reportingExportAll: 'Export all',
  reportingSearch: 'Search artists',
  reportingSortLabel: 'Sort artist payouts',
  reportingSortPayout: 'Highest payout first',
  reportingSortArtistAsc: 'Artist A–Z',
  reportingSortArtistDesc: 'Artist Z–A',
  reportingActions: 'Actions',
  reportingBreakdownAria: 'View payout breakdown for {artist}',
  reportingSendEmailAria: 'Send e-mail to {artist}',
  reportingPdfAria: 'Download statement PDF for {artist}',
  reportingExcelAria: 'Download Excel for {artist}',
  reportingSelectArtist: 'Select {artist}',
  reportingNoMatches: 'No artists match your search.',
  reportingNoData: 'No revenue data yet. Import sales files to begin.',
} as const

type SortMode = 'payout' | 'artist-asc' | 'artist-desc'

function sortModeToSorting(mode: SortMode): SortingState {
  if (mode === 'artist-asc') return [{ id: 'artist', desc: false }]
  if (mode === 'artist-desc') return [{ id: 'artist', desc: true }]
  return [{ id: 'finalAmount', desc: true }]
}

export function ReportingPanel({
  revenues,
  onDownloadPDF,
  onDownloadExcel,
  onDownloadAll,
  onDownloadSelected,
  labelArtists = [],
  labelInfo,
  appDefaults,
  splitFees = [],
  emailConfig,
  periodStart,
  periodEnd,
  onGoToSettlementCenter,
  disabled = false,
}: ReportingPanelProps) {
  const t = useMergedAccountingLabels(reportingFallback)
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const { listRef, pageSize } = useAccountingAdaptivePageSize(66, revenues.length > 0)
  const [sortMode, setSortMode] = useState<SortMode>('payout')
  const [sorting, setSorting] = useState<SortingState>(sortModeToSorting('payout'))
  const [breakdownArtist, setBreakdownArtist] = useState<ArtistRevenue | null>(null)

  const period = useMemo(() => {
    if (periodStart && periodEnd) return `${periodStart} – ${periodEnd}`
    return periodStart ?? periodEnd ?? ''
  }, [periodStart, periodEnd])

  const handleSendEmail = useCallback(
    (r: ArtistRevenue) => {
      const roster = labelArtists.find((a) => a.name.toLowerCase() === r.artist.toLowerCase())
      const artistEmail = roster?.email ?? ''
      const template = labelInfo?.emailTemplate ?? ''
      if (!template) {
        toast.error(t.reportingNoEmailTemplate)
        return
      }
      const amount = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(r.finalAmount)
      const href = buildMailtoLink(
        r.artist,
        artistEmail,
        period,
        amount,
        labelInfo ?? { name: '', address: '' },
        emailConfig ?? {},
        appDefaults ?? {},
        template,
      )
      window.open(href, '_blank')
    },
    [labelArtists, labelInfo, appDefaults, emailConfig, period, t.reportingNoEmailTemplate],
  )

  const filtered = useMemo(
    () => revenues.filter((r) => r.artist.toLowerCase().includes(filter.toLowerCase())),
    [revenues, filter],
  )

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortMode === 'artist-asc') return a.artist.localeCompare(b.artist)
    if (sortMode === 'artist-desc') return b.artist.localeCompare(a.artist)
    return b.finalAmount - a.finalAmount || a.artist.localeCompare(b.artist)
  }), [filtered, sortMode])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(sorted.length / pageSize) - 1))
  const paged = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const summary = useMemo(() => revenues.reduce((total, row) => ({
    revenue: total.revenue + row.totalRevenue,
    payout: total.payout + row.finalAmount,
    due: total.due + (row.amountDueEur ?? row.finalAmount),
    expenses: total.expenses + row.totalExpenses,
    fees: total.fees + row.distributionFeeDeducted,
    negative: total.negative + (row.finalAmount < 0 ? 1 : 0),
  }), { revenue: 0, payout: 0, due: 0, expenses: 0, fees: 0, negative: 0 }), [revenues])
  useEffect(() => {
    const currentNames = new Set(revenues.map(row => row.artist))
    setSelectedArtists(previous => {
      const remaining = [...previous].filter(name => currentNames.has(name))
      return remaining.length === previous.size ? previous : new Set(remaining)
    })
  }, [revenues])

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedArtists.has(r.artist))
  const someSelected = filtered.some((r) => selectedArtists.has(r.artist))
  const selectedCount = selectedArtists.size

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedArtists((prev) => {
        const next = new Set(prev)
        filtered.forEach((r) => next.delete(r.artist))
        return next
      })
    } else {
      setSelectedArtists((prev) => {
        const next = new Set(prev)
        filtered.forEach((r) => next.add(r.artist))
        return next
      })
    }
  }

  function toggleArtist(artist: string) {
    setSelectedArtists((prev) => {
      const next = new Set(prev)
      if (next.has(artist)) next.delete(artist)
      else next.add(artist)
      return next
    })
  }

  function exportSelected() {
    onDownloadSelected(Array.from(selectedArtists))
  }

  const columns: ColumnDef<ArtistRevenue>[] = [
    {
      id: 'select',
      size: 56,
      minSize: 56,
      maxSize: 56,
      enableResizing: false,
      enableSorting: false,
      header: () => (
        <Checkbox
          checked={allSelected}
          data-indeterminate={someSelected && !allSelected}
          onCheckedChange={toggleSelectAll}
          aria-label={t.reportingSelectAll}
          className="border-2 border-white/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedArtists.has(row.original.artist)}
          onCheckedChange={() => toggleArtist(row.original.artist)}
          aria-label={t.reportingSelectArtist.replace('{artist}', row.original.artist)}
          className="border-2 border-white/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
        />
      ),
    },
    {
      accessorKey: 'artist',
      header: t.reportingColArtist,
      size: 220,
      minSize: 100,
      meta: { align: 'left' as const },
      cell: ({ row, column }) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            className="truncate block font-medium text-left hover:text-primary hover:underline"
            style={{ maxWidth: column.getSize() - ARTIST_CELL_RESERVED_PX }}
            title={t.reportingBreakdownAria.replace('{artist}', row.original.artist)}
            aria-label={t.reportingBreakdownAria.replace('{artist}', row.original.artist)}
            onClick={() => setBreakdownArtist(row.original)}
          >
            {row.original.artist}
          </button>
        </div>
      ),
    },
    {
      accessorKey: 'totalRevenue',
      header: t.reportingColRevenue,
      size: 150,
      minSize: 90,
      meta: { align: 'right' as const },
      cell: ({ row }) => fmtEur(row.original.totalRevenue),
    },
    {
      accessorKey: 'finalAmount',
      header: t.reportingColPayout,
      size: 130,
      minSize: 90,
      meta: { align: 'right' as const },
      cell: ({ row }) => (
        <span className="text-emerald-400 font-medium">{fmtEur(row.original.finalAmount)}</span>
      ),
    },
    {
      accessorKey: 'openingBalanceEur',
      header: t.reportingColOpening,
      size: 120,
      minSize: 80,
      meta: { align: 'right' as const },
      cell: ({ row }) => fmtEur(row.original.openingBalanceEur ?? 0),
    },
    {
      accessorKey: 'amountDueEur',
      header: t.reportingColDue,
      size: 130,
      minSize: 90,
      meta: { align: 'right' as const },
      cell: ({ row }) => fmtEur(row.original.amountDueEur ?? row.original.finalAmount),
    },
    {
      id: 'actions',
      header: () => <span className="px-4">{t.reportingActions}</span>,
      size: 200,
      minSize: 200,
      maxSize: 200,
      enableResizing: false,
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="flex items-center justify-end gap-1.5 px-4">
            {labelInfo?.emailTemplate && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 gap-1 text-xs"
                onClick={() => handleSendEmail(r)}
                title={t.reportingSendEmailAria.replace('{artist}', r.artist)}
                aria-label={t.reportingSendEmailAria.replace('{artist}', r.artist)}
                disabled={disabled}
              >
                <EnvelopeSimple size={13} />
                Email
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => onDownloadPDF(r.artist)}
              title={t.reportingPdfAria.replace('{artist}', r.artist)}
              aria-label={t.reportingPdfAria.replace('{artist}', r.artist)}
              disabled={disabled}
            >
              <FileText size={13} />
              PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => onDownloadExcel(r.artist)}
              title={t.reportingExcelAria.replace('{artist}', r.artist)}
              aria-label={t.reportingExcelAria.replace('{artist}', r.artist)}
              disabled={disabled}
            >
              <TableIcon size={13} />
              Excel
            </Button>
          </div>
        )
      },
    },
  ]

  const table = useResizableAdminTable({
    data: paged,
    columns,
    getRowId: (row) => row.artist,
    initialColumnOrder: ['select', 'artist', 'totalRevenue', 'finalAmount', 'openingBalanceEur', 'amountDueEur', 'actions'],
    initialColumnSizing: {
      select: 56,
      artist: 220,
      totalRevenue: 150,
      finalAmount: 130,
      openingBalanceEur: 120,
      amountDueEur: 130,
      actions: 200,
    },
    sorting,
    onSortingChange: setSorting,
  })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {onGoToSettlementCenter && (
        <div className="px-6 pt-4">
          <Alert className="border-primary/30 bg-primary/5">
            <SealCheck size={16} className="text-primary" />
            <AlertTitle className="text-sm">{t.reportingSettlementAlertTitle}</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span>{t.reportingSettlementAlertBody}</span>
              <Button size="sm" className="gap-1.5 shrink-0" onClick={onGoToSettlementCenter}>
                {t.reportingSettlementCta}
                <ArrowRight size={14} />
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border px-4 py-3 sm:grid-cols-3 xl:grid-cols-5">
        {([
          [t.reportingSummaryGross, fmtEur(summary.revenue)],
          [t.reportingSummaryPayout, fmtEur(summary.payout)],
          [t.reportingSummaryDue, fmtEur(summary.due)],
          [t.reportingSummaryExpenses, fmtEur(summary.expenses)],
          [t.reportingSummaryFee, fmtEur(summary.fees)],
        ] as const).map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-md border border-border bg-card/30 p-2">
            <p className="truncate text-xs text-muted-foreground" title={label}>{label}</p>
            <p className="truncate text-sm font-semibold tabular-nums" title={value}>{value}</p>
          </div>
        ))}
        {summary.negative > 0 && (
          <p role="status" className="col-span-full text-xs text-amber-300">
            {t.reportingSummaryNegative.replace('{count}', String(summary.negative))}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/50 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {selectedCount > 0
              ? t.reportingSelectionCount.replace('{count}', String(selectedCount))
              : t.reportingSelectionEmpty}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={toggleSelectAll}
            disabled={filtered.length === 0}
          >
            {allSelected ? t.reportingDeselectAll : t.reportingSelectAll}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-9 gap-1.5 text-sm"
            disabled={disabled || selectedCount === 0}
            onClick={exportSelected}
          >
            <Archive size={14} />
            {t.reportingExportSelected}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={disabled || revenues.length === 0}
            onClick={onDownloadAll}
          >
            <DownloadSimple size={14} />
            {t.reportingExportAll}
          </Button>
        </div>
      </div>

      <div className="shrink-0 border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <MagnifyingGlass
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              placeholder={t.reportingSearch}
              aria-label={t.reportingSearch}
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setPage(0) }}
              className="h-10 pl-8 text-sm border-border/60 bg-background/50 focus:border-primary/60"
            />
          </div>
          <select
            aria-label={t.reportingSortLabel}
            value={sortMode}
            onChange={(e) => {
              const mode = e.target.value as SortMode
              setSortMode(mode)
              setPage(0)
              setSorting(sortModeToSorting(mode))
            }}
            className="h-10 rounded-md border border-border/60 bg-background/50 px-3 text-sm text-foreground"
          >
            <option value="payout">{t.reportingSortPayout}</option>
            <option value="artist-asc">{t.reportingSortArtistAsc}</option>
            <option value="artist-desc">{t.reportingSortArtistDesc}</option>
          </select>
        </div>
      </div>

      {revenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <DownloadSimple size={32} className="opacity-30" />
          <p className="text-sm">{t.reportingNoData}</p>
        </div>
      ) : (
        <div ref={listRef} className="min-h-0 flex-1 overflow-hidden">
          <AdminResizableDataTable
            table={table}
            className="h-full min-h-0 overflow-auto"
            emptyMessage={t.reportingNoMatches}
          />
        </div>
      )}

      <div className="shrink-0 px-4 py-2 sm:px-6">
        <AccountingListPagination count={sorted.length} page={currentPage}
          pageSize={pageSize} onPageChange={setPage} />
      </div>
      <ArtistPayoutBreakdown
        revenue={breakdownArtist}
        open={breakdownArtist != null}
        onOpenChange={(open) => {
          if (!open) setBreakdownArtist(null)
        }}
        splitFees={splitFees}
        appDefaults={appDefaults}
      />
    </div>
  )
}