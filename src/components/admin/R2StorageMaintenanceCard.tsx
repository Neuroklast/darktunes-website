'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Database, Spinner, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { drainAssetOptimizations } from '@/lib/images/drainAssetOptimizations'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { R2_ORPHAN_PURGE_CONFIRMATION } from '@/lib/r2/constants'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

interface SnapshotPayload {
  status?: string
  used_bytes?: number
  object_count?: number
  orphan_bytes?: number
  orphan_count?: number
  multipart_aborted_count?: number
  truncated?: boolean
  next_cursor?: string | null
  scanned_at?: string | null
}

type BusyKey = 'scan' | 'purge' | 'optimize' | null

export function R2StorageMaintenanceCard() {
  const t = useTranslations('admin.r2_storage')
  const tToast = useTranslations('admin.toast')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null)
  const [busy, setBusy] = useState<BusyKey>(null)
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [purgeText, setPurgeText] = useState('')

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    return headers
  }, [supabase])

  const loadSnapshot = useCallback(async () => {
    const headers = await authHeaders()
    const res = await fetch('/api/admin/storage-snapshots', { headers, credentials: 'include', cache: 'no-store' })
    if (!res.ok) return
    const json = (await res.json()) as { snapshot?: SnapshotPayload | null }
    setSnapshot(json.snapshot ?? null)
  }, [authHeaders])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  async function runScan(cursor?: string | null) {
    setBusy('scan')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/storage-snapshots', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(cursor ? { cursor } : {}),
      })
      const json = (await res.json()) as { snapshot?: SnapshotPayload; error?: string }
      if (!res.ok) throw new Error(json.error ?? tToast('r2_scan_failed'))
      setSnapshot(json.snapshot ?? null)
      if (res.status === 202) toast.info(tToast('r2_scan_continued'))
      else toast.success(tToast('r2_scan_complete'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast('r2_scan_failed'))
    } finally {
      setBusy(null)
    }
  }

  async function runPurge() {
    setBusy('purge')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/r2-orphan-purges', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ confirmation: R2_ORPHAN_PURGE_CONFIRMATION }),
      })
      const json = (await res.json()) as { deleted?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? tToast('r2_purge_failed'))
      toast.success(tToast('r2_purge_complete', { deleted: json.deleted ?? 0 }))
      await loadSnapshot()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast('r2_purge_failed'))
    } finally {
      setBusy(null)
      setPurgeOpen(false)
      setPurgeText('')
    }
  }

  async function runOptimize() {
    setBusy('optimize')
    try {
      const headers = await authHeaders()
      const result = await drainAssetOptimizations({ headers })
      toast.success(
        tToast('r2_optimize_complete', {
          processed: result.processed,
          saved: formatBytes(result.bytes_saved),
        }),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast('r2_optimize_failed'))
    } finally {
      setBusy(null)
    }
  }

  const scanCursor = snapshot?.status === 'running' ? snapshot.next_cursor : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database size={18} weight="bold" aria-hidden="true" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {snapshot
              ? t('used', { used: formatBytes(snapshot.used_bytes ?? 0) })
              : t('never_scanned')}
            {snapshot ? ` · ${t('objects', { count: snapshot.object_count ?? 0 })}` : ''}
          </p>
          {snapshot && (snapshot.orphan_count ?? 0) > 0 && (
            <p>{t('orphans', { count: snapshot.orphan_count ?? 0, bytes: formatBytes(snapshot.orphan_bytes ?? 0) })}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void runScan(scanCursor)}
            className="gap-2"
          >
            {busy === 'scan' ? <Spinner size={14} className="animate-spin" aria-hidden="true" /> : null}
            {scanCursor ? t('continue_scan') : t('scan')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy !== null || snapshot?.status !== 'completed'}
            onClick={() => {
              setPurgeText('')
              setPurgeOpen(true)
            }}
            className="gap-2"
          >
            <Warning size={14} aria-hidden="true" />
            {t('purge')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void runOptimize()}
            className="gap-2"
          >
            {busy === 'optimize' ? <Spinner size={14} className="animate-spin" aria-hidden="true" /> : null}
            {t('optimize')}
          </Button>
        </div>
      </CardContent>

      <AlertDialog
        open={purgeOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPurgeOpen(false)
            setPurgeText('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('purge_title')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t('purge_body')}</p>
                <Input
                  value={purgeText}
                  onChange={(event) => setPurgeText(event.target.value)}
                  placeholder={t('purge_placeholder')}
                  autoComplete="off"
                  aria-label={t('purge_aria')}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={purgeText !== R2_ORPHAN_PURGE_CONFIRMATION || busy !== null}
              onClick={() => void runPurge()}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('purge')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
