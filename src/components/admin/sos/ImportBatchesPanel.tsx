'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { SosConfirmDialog } from '@/components/admin/sos/SosConfirmDialog'
import { toast } from 'sonner'
import { ArrowsClockwise, Database, Trash, DownloadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { horizontalScrollClass } from '@/components/ui/scroll-panel'
import { Badge } from '@/components/ui/badge'
import type { DistributorImportBatch } from '@/lib/api/distributorImportBatches'
import type { LabelArtist } from '@/lib/sos/types'
import { useMergedAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'
import { explainSosError } from '@/lib/sos/explainSosError'

interface ImportBatchesPanelProps {
  labelArtists: LabelArtist[]
  onLoadBatch?: (batch: DistributorImportBatch) => void | Promise<void>
  exchangeRates?: Record<string, number>
  historicalRates?: Record<string, Record<string, number>>
  carryForwardByArtist?: Record<string, number>
}

const BRONZE_FALLBACK = {
  bronzeLoading: 'Loading Bronze archives…',
  bronzeEmpty: 'No Bronze CSV archives yet. Upload distributor files to archive them in R2.',
  bronzeTitle: 'Bronze CSV Archives',
  bronzeRefresh: 'Refresh',
  bronzeColDistributor: 'Distributor',
  bronzeColPeriod: 'Period',
  bronzeColRows: 'Rows',
  bronzeColStatus: 'Status',
  bronzeColActions: 'Actions',
  bronzeValidate: 'Validate',
  bronzeRebuildGold: 'Rebuild Gold',
  bronzeLoad: 'Load for processing',
  bronzeDelete: 'Delete',
  bronzeDeleteConfirm: 'Delete this bronze archive (raw CSV in R2) permanently?',
  bronzeLoadError: 'Failed to load import batches',
  bronzeArchiveLoadError: 'Failed to load saved archive',
  bronzeArchiveIncomplete: 'This import was not fully archived. Select the original CSV to upload it again.'
  bronzeLoadUnavailable: 'Load is not available in this context',
  bronzeLoadSuccess: 'Loaded {distributor} archive into workspace',
  bronzeDeleteError: 'Delete failed',
  bronzeDeleteSuccess: 'Bronze archive deleted',
  bronzeReprocessError: 'Reprocess failed',
  bronzeReprocessSaved: 'Reprocessed & saved {metricCount} metrics from {rowCount} rows',
  bronzeReprocessValidated: 'Validated {rowCount} rows ({metricCount} metric groups)',
} as const

export function ImportBatchesPanel({
  labelArtists,
  onLoadBatch,
  exchangeRates,
  historicalRates,
  carryForwardByArtist,
}: ImportBatchesPanelProps) {
  const t = useMergedAccountingLabels(BRONZE_FALLBACK)
  const [batches, setBatches] = useState<DistributorImportBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const loadBatches = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/sos/import-batches')
      if (!res.ok) throw new Error(t.bronzeLoadError)
      const data = (await res.json()) as { batches: DistributorImportBatch[] }
      setBatches(data.batches ?? [])
      setLoadError(null)
    } catch (err) {
      const message = explainSosError(err instanceof Error ? err.message : t.bronzeLoadError, t)
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const handleLoad = async (batch: DistributorImportBatch) => {
    if (batch.status !== 'completed' || !batch.fileHash) {
      toast.error(t.bronzeArchiveIncomplete)
      return
    }
    if (!onLoadBatch) {
      toast.info(t.bronzeLoadUnavailable)
      return
    }
    try {
      await onLoadBatch(batch)
      const dist = batch.distributor
      toast.success(interpolate(t.bronzeLoadSuccess, { distributor: dist }))
    } catch (err) {
      toast.error(t.bronzeArchiveLoadError, {
        description: err instanceof Error ? err.message : t.bronzeLoadError,
      })
    }
  }

  const handleDelete = (batchId: string) => {
    setDeleteTargetId(batchId)
  }

  const confirmDelete = () => {
    if (!deleteTargetId) return
    const batchId = deleteTargetId
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/sos/import-batches/${batchId}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(typeof data?.error === 'string' ? data.error : t.bronzeDeleteError)
        }
        toast.success(t.bronzeDeleteSuccess)
        setDeleteTargetId(null)
        await loadBatches()
      } catch (err) {
        toast.error(explainSosError(err instanceof Error ? err.message : t.bronzeDeleteError, t))
      }
    })
  }

  const handleReprocess = (batchId: string, persist: boolean) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/sos/import-batches/${batchId}/reprocess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            persist,
            label_artists: labelArtists.map((la) => ({
              name: la.name,
              artistId: la.artistId,
            })),
            exchange_rates: exchangeRates,
            historical_rates: historicalRates,
            carry_forward_by_artist: carryForwardByArtist,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(typeof data?.error === 'string' ? data.error : t.bronzeReprocessError)
        }
        const metricCount = String(data.metricCount ?? 0)
        const rowCount = String(data.rowCount ?? 0)
        toast.success(
          persist
            ? interpolate(t.bronzeReprocessSaved, { metricCount, rowCount })
            : interpolate(t.bronzeReprocessValidated, { rowCount, metricCount }),
        )
        await loadBatches()
      } catch (err) {
        toast.error(explainSosError(err instanceof Error ? err.message : t.bronzeReprocessError, t))
      }
    })
  }

  if (loading && batches.length === 0 && !loadError) {
    return <p className="text-sm text-muted-foreground p-4">{t.bronzeLoading}</p>
  }

  if (loadError && batches.length === 0) {
    return (
      <div
        className="flex flex-col gap-3 border border-border rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between"
        role="alert"
      >
        <p className="text-sm text-destructive">{loadError}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadBatches()} disabled={loading}>
          {t.bronzeRefresh}
        </Button>
      </div>
    )
  }

  if (batches.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
        <Database size={18} />
        {t.bronzeEmpty}
      </div>
    )
  }

  return (
    <>
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-card/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database size={16} />
          {t.bronzeTitle}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => void loadBatches()} disabled={isPending}>
          {t.bronzeRefresh}
        </Button>
      </div>
      {loadError && (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadBatches()} disabled={loading}>
            {t.bronzeRefresh}
          </Button>
        </div>
      )}
      <div className={horizontalScrollClass} data-lenis-prevent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="px-4 py-2" scope="col">{t.bronzeColDistributor}</th>
              <th className="px-4 py-2" scope="col">{t.bronzeColPeriod}</th>
              <th className="px-4 py-2" scope="col">{t.bronzeColRows}</th>
              <th className="px-4 py-2" scope="col">{t.bronzeColStatus}</th>
              <th className="px-4 py-2 text-right" scope="col">{t.bronzeColActions}</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id} className="border-b border-border/50">
                <td className="px-4 py-2 capitalize">{batch.distributor}</td>
                <td className="px-4 py-2 tabular-nums">
                  {batch.periodStart} – {batch.periodEnd}
                </td>
                <td className="px-4 py-2 tabular-nums">{batch.rowCount.toLocaleString()}</td>
                <td className="px-4 py-2">
                  <Badge variant="outline" className="text-xs capitalize">
                    {batch.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  {onLoadBatch && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending || batch.status !== 'completed' || !batch.fileHash}
                      onClick={() => void handleLoad(batch)}
                      title={batch.status !== 'completed' || !batch.fileHash
                        ? t.bronzeArchiveIncomplete
                        : t.bronzeLoad}
                    >
                      <DownloadSimple size={14} className="mr-1" />
                      {t.bronzeLoad}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleReprocess(batch.id, false)}
                  >
                    {t.bronzeValidate}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleReprocess(batch.id, true)}
                  >
                    <ArrowsClockwise size={14} className="mr-1" />
                    {t.bronzeRebuildGold}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleDelete(batch.id)}
                    title={t.bronzeDelete}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    <SosConfirmDialog
      open={deleteTargetId != null}
      onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}
      title={t.bronzeDelete}
      description={t.bronzeDeleteConfirm}
      confirmLabel={t.bronzeDelete}
      cancelLabel={t.presetDeleteCancel}
      destructive
      loading={isPending}
      onConfirm={confirmDelete}
    />
    </>
  )
}