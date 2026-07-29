'use client'

import { useTranslations } from 'next-intl'
/**
 * src/components/admin/MaintenanceManager.tsx
 *
 * Admin-only Maintenance tab — provides centralised system maintenance
 * operations: clearing log tables, purging releases, resetting checklists
 * and accreditations, clearing statistics, and cache revalidation.
 *
 * Every destructive action (delete / purge) is guarded by an AlertDialog.
 * "Purge ALL Releases" uses a two-step confirmation flow that requires the
 * user to type the word "PURGE" before the action is enabled.
 */

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
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
import {
  ArrowsClockwise,
  Broom,
  Warning,
  Trash,
  ArrowCounterClockwise,
  FloppyDisk,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadingKey =
  | 'clear-app-logs'
  | 'clear-sync-logs'
  | 'clear-rbac-logs'
  | 'clear-admin-logs'
  | 'clean-orphaned'
  | 'purge-releases'
  | 'clear-accreditations'
  | 'reset-accreditations'
  | 'clear-streaming-stats'
  | 'clear-sos-summaries'
  | 'revalidate-all'
  | 'revalidate-site-settings'
  | 'requeue-sync-jobs'

type ConfirmDialog =
  | 'clear-app-logs'
  | 'clear-sync-logs'
  | 'clear-rbac-logs'
  | 'clear-admin-logs'
  | 'purge-step1'
  | 'purge-step2'
  | 'clear-accreditations'
  | 'reset-accreditations'
  | 'clear-streaming-stats'
  | 'clear-sos-summaries'
  | 'requeue-sync-jobs'
  | null

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MaintenanceManager() {
  const tToast = useTranslations('admin.toast')


  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [loading, setLoading] = useState<LoadingKey | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)
  const [purgeConfirmText, setPurgeConfirmText] = useState('')

  // -------------------------------------------------------------------------
  // Auth helper
  // -------------------------------------------------------------------------
  async function getBearerToken(): Promise<string> {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated')
    return session.access_token
  }

  // -------------------------------------------------------------------------
  // Generic fetch wrapper for maintenance endpoints
  // -------------------------------------------------------------------------
  async function callMaintenanceApi(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const token = await getBearerToken()
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(err.error ?? `Request failed (${res.status})`)
    }
    return res.json() as Promise<Record<string, unknown>>
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleClearLogs(
    table: 'app_logs' | 'sync_logs' | 'rbac_audit_log' | 'admin_audit_log',
    key: LoadingKey,
    label: string,
  ) {
    setLoading(key)
    try {
      const result = await callMaintenanceApi(
        '/api/admin/maintenance/clear-logs',
        { table },
      )
      const deleted = result.deleted as number
      toast.success(`${deleted} ${label} entr${deleted === 1 ? 'y' : 'ies'} deleted`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear logs')
    } finally {
      setLoading(null)
      setConfirmDialog(null)
    }
  }

  async function handleCleanOrphaned() {

    setLoading('clean-orphaned')
    try {
      const token = await getBearerToken()
      const res = await fetch('/api/admin/cleanup-orphaned-releases', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? `Request failed (${res.status})`)
      }
      const { deleted } = (await res.json()) as { deleted: number }
      if (deleted > 0) {
        toast.success(`Deleted ${deleted} orphaned release(s)`)
      } else {
        toast.info(tToast('no_orphaned_releases'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clean orphaned releases')
    } finally {
      setLoading(null)
    }
  }

  async function handlePurgeReleases() {
    setLoading('purge-releases')
    setPurgeConfirmText('')
    try {
      const result = await callMaintenanceApi('/api/admin/maintenance/purge-releases')
      const releasesDeleted = result.releasesDeleted as number
      const junctionDeleted = result.junctionDeleted as number
      toast.warning(
        `${releasesDeleted} release(s) and ${junctionDeleted} junction row(s) deleted`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to purge releases')
    } finally {
      setLoading(null)
      setConfirmDialog(null)
    }
  }

  async function handleClearAccreditations() {
    setLoading('clear-accreditations')
    try {
      const result = await callMaintenanceApi(
        '/api/admin/maintenance/clear-accreditations',
      )
      const deleted = result.deleted as number
      toast.success(`${deleted} accreditation request(s) deleted`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear accreditations')
    } finally {
      setLoading(null)
      setConfirmDialog(null)
    }
  }

  async function handleResetAccreditations() {
    setLoading('reset-accreditations')
    try {
      const result = await callMaintenanceApi(
        '/api/admin/maintenance/reset-accreditations',
      )
      const updated = result.updated as number
      toast.success(`${updated} accreditation(s) reset to pending`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset accreditations')
    } finally {
      setLoading(null)
      setConfirmDialog(null)
    }
  }

  async function handleClearStats(
    table: 'streaming_stats' | 'sos_period_summaries',
    key: LoadingKey,
    label: string,
  ) {
    setLoading(key)
    try {
      const result = await callMaintenanceApi(
        '/api/admin/maintenance/clear-stats',
        { table },
      )
      const deleted = result.deleted as number
      toast.success(`${deleted} ${label} row(s) deleted`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear stats')
    } finally {
      setLoading(null)
      setConfirmDialog(null)
    }
  }

  async function handleRevalidateAll() {

    setLoading('revalidate-all')
    try {
      const res = await fetch('/api/revalidate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: ['artists', 'releases', 'news', 'videos', 'concerts'] }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      toast.success(tToast('all_caches_revalidated'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revalidate caches')
    } finally {
      setLoading(null)
    }
  }

  async function handleRequeueSyncJobs() {

    setLoading('requeue-sync-jobs')
    try {
      const result = await callMaintenanceApi('/api/sync/requeue')
      const requeued = result.requeued as number
      if (requeued > 0) {
        toast.success(`${requeued} failed sync job(s) re-queued`)
      } else {
        toast.info(tToast('no_failed_sync_jobs'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to re-queue sync jobs')
    } finally {
      setLoading(null)
      setConfirmDialog(null)
    }
  }

  async function handleRevalidateSiteSettings() {

    setLoading('revalidate-site-settings')
    try {
      const res = await fetch('/api/revalidate-site-settings', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      toast.success(tToast('site_settings_cache_revalidated'))
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to revalidate site settings',
      )
    } finally {
      setLoading(null)
    }
  }

  // -------------------------------------------------------------------------
  // Spinner helper
  // -------------------------------------------------------------------------
  function Spinner({ active }: { active: boolean }) {
    return active ? (
      <ArrowsClockwise
        size={14}
        className="animate-spin"
        aria-hidden="true"
      />
    ) : null
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — Log Management                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Broom size={18} weight="bold" aria-hidden="true" />
            Log Management
          </CardTitle>
          <CardDescription>
            Clear log tables to free up space and reduce noise. These actions are
            irreversible.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('clear-app-logs')}
            className="gap-2"
          >
            <Spinner active={loading === 'clear-app-logs'} />
            Clear App Logs
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('clear-sync-logs')}
            className="gap-2"
          >
            <Spinner active={loading === 'clear-sync-logs'} />
            Clear Sync Logs
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('clear-rbac-logs')}
            className="gap-2"
          >
            <Spinner active={loading === 'clear-rbac-logs'} />
            Clear RBAC Audit Log
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('clear-admin-logs')}
            className="gap-2"
          >
            <Spinner active={loading === 'clear-admin-logs'} />
            Clear Admin Audit Log
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Release Management                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash size={18} weight="bold" aria-hidden="true" />
            Release Management
          </CardTitle>
          <CardDescription>
            Orphan cleanup removes releases with no linked artist. Purge deletes
            ALL releases permanently — use with extreme caution.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => void handleCleanOrphaned()}
            className="gap-2"
          >
            <Spinner active={loading === 'clean-orphaned'} />
            Clean Orphaned Releases
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('purge-step1')}
            className="gap-2"
          >
            <Spinner active={loading === 'purge-releases'} />
            <Warning size={14} aria-hidden="true" />
            Purge ALL Releases
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Accreditations                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
            Accreditations
          </CardTitle>
          <CardDescription>
            Manage accreditation request data. Deleting removes all requests;
            resetting sets all statuses back to pending.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('clear-accreditations')}
            className="gap-2"
          >
            <Spinner active={loading === 'clear-accreditations'} />
            Delete All Accreditations
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('reset-accreditations')}
            className="gap-2"
          >
            <Spinner active={loading === 'reset-accreditations'} />
            Reset All Accreditations to Pending
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 4 — Statistics & Analytics                                  */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash size={18} weight="bold" aria-hidden="true" />
            Statistics &amp; Analytics
          </CardTitle>
          <CardDescription>
            Clear analytics data. This is irreversible and will remove all
            historical stats.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('clear-streaming-stats')}
            className="gap-2"
          >
            <Spinner active={loading === 'clear-streaming-stats'} />
            Clear Streaming Stats
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('clear-sos-summaries')}
            className="gap-2"
          >
            <Spinner active={loading === 'clear-sos-summaries'} />
            Clear Sales Statement Period Summaries
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 5 — Sync Queue                                              */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowsClockwise size={18} weight="bold" aria-hidden="true" />
            Sync Queue
          </CardTitle>
          <CardDescription>
            Retry permanently failed background sync jobs. Re-queued jobs are
            picked up by the next cron execution of{' '}
            <code className="font-mono text-xs">/api/sync</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => setConfirmDialog('requeue-sync-jobs')}
            className="gap-2"
          >
            <Spinner active={loading === 'requeue-sync-jobs'} />
            Requeue Failed Sync Jobs
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 6 — Cache & System                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FloppyDisk size={18} weight="bold" aria-hidden="true" />
            Cache &amp; System
          </CardTitle>
          <CardDescription>
            Trigger on-demand ISR cache revalidation so the public frontend
            immediately reflects the latest database content.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => void handleRevalidateAll()}
            className="gap-2"
          >
            <Spinner active={loading === 'revalidate-all'} />
            <ArrowsClockwise
              size={14}
              aria-hidden="true"
              className={cn(loading === 'revalidate-all' && 'hidden')}
            />
            Revalidate All Caches
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading !== null}
            onClick={() => void handleRevalidateSiteSettings()}
            className="gap-2"
          >
            <Spinner active={loading === 'revalidate-site-settings'} />
            <ArrowsClockwise
              size={14}
              aria-hidden="true"
              className={cn(loading === 'revalidate-site-settings' && 'hidden')}
            />
            Revalidate Site Settings Cache
          </Button>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Confirmation Dialogs                                                */}
      {/* ================================================================== */}

      {/* Clear App Logs */}
      <AlertDialog
        open={confirmDialog === 'clear-app-logs'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear App Error Logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all rows from{' '}
              <code className="font-mono text-xs">app_logs</code>. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void handleClearLogs('app_logs', 'clear-app-logs', 'app log')
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete All App Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Sync Logs */}
      <AlertDialog
        open={confirmDialog === 'clear-sync-logs'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Sync Logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all rows from{' '}
              <code className="font-mono text-xs">sync_logs</code>. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void handleClearLogs('sync_logs', 'clear-sync-logs', 'sync log')
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete All Sync Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear RBAC Audit Log */}
      <AlertDialog
        open={confirmDialog === 'clear-rbac-logs'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear RBAC Audit Log?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all rows from{' '}
              <code className="font-mono text-xs">rbac_audit_log</code>. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void handleClearLogs(
                  'rbac_audit_log',
                  'clear-rbac-logs',
                  'RBAC audit log',
                )
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete All RBAC Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Admin Audit Log */}
      <AlertDialog
        open={confirmDialog === 'clear-admin-logs'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Admin Audit Log?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all rows from{' '}
              <code className="font-mono text-xs">admin_audit_log</code>. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void handleClearLogs(
                  'admin_audit_log',
                  'clear-admin-logs',
                  'admin audit log',
                )
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete All Admin Logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Purge Releases — Step 1 */}
      <AlertDialog
        open={confirmDialog === 'purge-step1'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog(null)
            setPurgeConfirmText('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Warning size={18} aria-hidden="true" />
              Purge ALL Releases?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <strong>every release and all artist–release links</strong> in the
              database. This cannot be undone. A second confirmation is required.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDialog('purge-step2')
                setPurgeConfirmText('')
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              I understand — continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Purge Releases — Step 2 (type PURGE to confirm) */}
      <AlertDialog
        open={confirmDialog === 'purge-step2'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog(null)
            setPurgeConfirmText('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Warning size={18} aria-hidden="true" />
              Final Confirmation Required
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Type <code className="font-mono font-bold text-foreground">PURGE</code>{' '}
                  in the field below to confirm deletion of ALL releases.
                </p>
                <Input
                  value={purgeConfirmText}
                  onChange={(e) => setPurgeConfirmText(e.target.value)}
                  placeholder="Type PURGE to confirm"
                  autoComplete="off"
                  aria-label="Type PURGE to confirm"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmDialog(null)
                setPurgeConfirmText('')
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handlePurgeReleases()}
              disabled={purgeConfirmText !== 'PURGE' || loading === 'purge-releases'}
              className="bg-destructive hover:bg-destructive/90"
            >
              Purge All Releases
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Accreditations */}
      <AlertDialog
        open={confirmDialog === 'clear-accreditations'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Accreditation Requests?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all rows from{' '}
              <code className="font-mono text-xs">accreditation_requests</code>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleClearAccreditations()}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete All Accreditations
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Accreditations */}
      <AlertDialog
        open={confirmDialog === 'reset-accreditations'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Accreditations to Pending?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set{' '}
              <code className="font-mono text-xs">status = &apos;pending&apos;</code>{' '}
              for every accreditation request. Approved and rejected requests will
              need to be reviewed again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleResetAccreditations()}>
              Reset All to Pending
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Streaming Stats */}
      <AlertDialog
        open={confirmDialog === 'clear-streaming-stats'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Streaming Stats?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all rows from{' '}
              <code className="font-mono text-xs">streaming_stats</code>. All
              historical stream count data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void handleClearStats(
                  'streaming_stats',
                  'clear-streaming-stats',
                  'streaming stats',
                )
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete All Streaming Stats
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Requeue Failed Sync Jobs */}
      <AlertDialog
        open={confirmDialog === 'requeue-sync-jobs'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Requeue Failed Sync Jobs?</AlertDialogTitle>
            <AlertDialogDescription>
              This resets all jobs in{' '}
              <code className="font-mono text-xs">sync_queue</code> with status{' '}
              <code className="font-mono text-xs">failed</code> back to{' '}
              <code className="font-mono text-xs">pending</code> so the cron
              executor can retry them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRequeueSyncJobs()}>
              Requeue Failed Jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Sales Statement Period Summaries */}
      <AlertDialog
        open={confirmDialog === 'clear-sos-summaries'}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Sales Statement Period Summaries?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all rows from{' '}
              <code className="font-mono text-xs">sos_period_summaries</code>.
              All computed period summary data will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void handleClearStats(
                  'sos_period_summaries',
                  'clear-sos-summaries',
                  'sales statement period summary',
                )
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete All Sales Statement Period Summaries
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
