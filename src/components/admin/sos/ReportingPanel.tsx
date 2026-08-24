'use client'

import { useState, useMemo, useCallback } from 'react'
import { ArtistPayoutBreakdown } from '@/components/admin/sos/ArtistPayoutBreakdown'
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
import type { ArtistRevenue, LabelArtist, LabelInfo, AppDefaults, EmailConfig } from '@/lib/sos/types'
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
  emailConfig?: Partial<EmailConfig>
  periodStart?: string
  periodEnd?: string
  onGoToSettlementCenter?: () => void
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
  emailConfig,
  periodStart,
  periodEnd,
  onGoToSettlementCenter,
}: ReportingPanelProps) {
  const t = useMergedAccountingLabels(reportingFallback)
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
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
          aria-label="Select all artists"
          className="border-2 border-white/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedArtists.has(row.original.artist)}
          onCheckedChange={() => toggleArtist(row.original.artist)}
          aria-label={`Select ${row.original.artist}`}
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
            title={`${row.original.artist} — payout breakdown`}
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
      header: () => <span className="px-4">Actions</span>,
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
                title={`Send e-mail to ${r.artist}`}
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
              title={`Download PDF for ${r.artist}`}
            >
              <FileText size={13} />
              PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => onDownloadExcel(r.artist)}
              title={`Download Excel for ${r.artist}`}
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
    data: filtered,
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
    <div className="flex flex-col h-full">
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

      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10 bg-card/60 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} artist${selectedCount !== 1 ? 's' : ''} selected`
              : 'No artists selected'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={toggleSelectAll}
            disabled={filtered.length === 0}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={selectedCount === 0}
            onClick={exportSelected}
          >
            <Archive size={14} />
            Export Selected to ZIP
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={revenues.length === 0}
            onClick={onDownloadAll}
          >
            <DownloadSimple size={14} />
            Export All
          </Button>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-white/5">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative max-w-sm flex-1">
            <MagnifyingGlass
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="text"
              placeholder="Filter by artist…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 h-9 text-sm border-border/60 bg-background/50 focus:border-primary/60"
            />
          </div>
          <select
            value={sortMode}
            onChange={(e) => {
              const mode = e.target.value as SortMode
              setSortMode(mode)
              setSorting(sortModeToSorting(mode))
            }}
            className="h-9 rounded-md border border-border/60 bg-background/50 px-3 text-xs text-foreground"
          >
            <option value="payout">Sort: payout</option>
            <option value="artist-asc">Sort: artist A-Z</option>
            <option value="artist-desc">Sort: artist Z-A</option>
          </select>
        </div>
      </div>

      {revenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <DownloadSimple size={32} className="opacity-30" />
          <p className="text-sm">No revenue data yet. Upload a CSV to get started.</p>
        </div>
      ) : (
        <AdminResizableDataTable
          table={table}
          emptyMessage="No artists match your filter."
        />
      )}

      <ArtistPayoutBreakdown
        revenue={breakdownArtist}
        open={breakdownArtist != null}
        onOpenChange={(open) => {
          if (!open) setBreakdownArtist(null)
        }}
      />
    </div>
  )
}