'use client'

/**
 * Chain-of-custody card for royalty statements: hash, distributor, period, source CSV.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Copy,
  DownloadSimple,
  ShieldCheck,
  Spinner,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { StatementSourceProvenance } from '@/lib/api/distributorImportBatches'
import { getPortalAuthHeaders } from '@/lib/portal/portalFetchAuth'
import { cn } from '@/lib/utils'

interface StatementProvenanceCardProps {
  artistId: string
  statementId: string
  statementPeriod: string
  provenance: StatementSourceProvenance | undefined
  className?: string
}

function shortHash(hash: string): string {
  if (hash.length <= 20) return hash
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`
}

export function StatementProvenanceCard({
  artistId,
  statementId,
  statementPeriod,
  provenance,
  className,
}: StatementProvenanceCardProps) {
  const t = useTranslations('portal')
  const [downloading, setDownloading] = useState(false)

  const copyHash = async () => {
    if (!provenance?.fileHash) return
    try {
      await navigator.clipboard.writeText(provenance.fileHash)
      toast.success(t('statements_provenance_hash_copied'))
    } catch {
      toast.error(t('statements_provenance_hash_copy_failed'))
    }
  }

  const downloadSource = async () => {
    if (!provenance?.canDownloadSource) return
    setDownloading(true)
    toast.info(t('statements_provenance_downloading'))
    try {
      const headers = await getPortalAuthHeaders()
      const url = new URL(
        `/api/portal/statements/${statementId}/source-csv`,
        window.location.origin,
      )
      url.searchParams.set('artistId', artistId)
      const res = await fetch(url.toString(), { headers, credentials: 'same-origin' })
      if (!res.ok) {
        toast.error(t('statements_provenance_download_error'))
        return
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        `source-${statementPeriod}.csv`
      a.click()
      URL.revokeObjectURL(objectUrl)
      toast.success(t('statements_provenance_download_ok'))
    } catch {
      toast.error(t('statements_provenance_download_error'))
    } finally {
      setDownloading(false)
    }
  }

  if (!provenance) {
    return (
      <div
        className={cn(
          'rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground',
          className,
        )}
      >
        <div className="flex items-start gap-2">
          <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{t('statements_provenance_missing')}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-3 space-y-2.5',
        'dark:bg-emerald-500/10 dark:border-emerald-500/40',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck
          size={18}
          weight="fill"
          className="text-emerald-700 dark:text-emerald-300 shrink-0"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
          {t('statements_provenance_title')}
        </p>
        <Badge
          variant="outline"
          className="text-[10px] font-normal border-emerald-600/40 text-emerald-900 dark:text-emerald-100"
        >
          {t('statements_provenance_badge')}
        </Badge>
      </div>

      <p className="text-xs leading-relaxed text-foreground/90">
        {t('statements_provenance_lead')}
      </p>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <dt className="text-muted-foreground">{t('statements_provenance_distributor')}</dt>
          <dd className="font-medium capitalize">{provenance.distributor}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('statements_provenance_source_period')}</dt>
          <dd className="font-mono tabular-nums">
            {provenance.periodStart} – {provenance.periodEnd}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('statements_provenance_rows')}</dt>
          <dd className="font-mono tabular-nums">
            {new Intl.NumberFormat().format(provenance.rowCount)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('statements_provenance_archived')}</dt>
          <dd className="font-mono tabular-nums">
            {new Date(provenance.uploadedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
          </dd>
        </div>
        <div className="sm:col-span-2 min-w-0">
          <dt className="text-muted-foreground">{t('statements_provenance_hash')}</dt>
          <dd className="flex flex-wrap items-center gap-2 mt-0.5">
            {provenance.fileHash ? (
              <>
                <code
                  className="font-mono text-[11px] break-all bg-background/60 px-1.5 py-0.5 rounded border border-border"
                  title={provenance.fileHash}
                >
                  sha256:{shortHash(provenance.fileHash)}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 min-h-[44px] sm:min-h-0 sm:h-7 text-xs"
                  onClick={() => void copyHash()}
                >
                  <Copy size={14} className="mr-1" aria-hidden="true" />
                  {t('statements_provenance_copy_hash')}
                </Button>
              </>
            ) : (
              <span className="text-muted-foreground">{t('statements_provenance_hash_none')}</span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">{t('statements_provenance_batch_id')}</dt>
          <dd className="font-mono text-[11px] break-all">{provenance.batchId}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-[44px] sm:min-h-0"
          disabled={!provenance.canDownloadSource || downloading}
          onClick={() => void downloadSource()}
        >
          {downloading ? (
            <Spinner size={14} className="mr-1 animate-spin" aria-hidden="true" />
          ) : (
            <DownloadSimple size={14} className="mr-1" aria-hidden="true" />
          )}
          {t('statements_provenance_download_source')}
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t('statements_provenance_verify_hint')}
      </p>
    </div>
  )
}
