'use client'

/**
 * src/components/admin/SystemHealthWidget.tsx
 *
 * Admin "System Health & API Status" dashboard widget.
 */

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Database,
  CheckCircle,
  XCircle,
  Warning,
  ArrowsClockwise,
  Spinner,
  MusicNote,
  Microphone,
  Record as RecordIcon,
  Ticket,
  YoutubeLogo,
  Link,
  Queue,
  Gauge,
  Bell,
  ChartLine,
  Headphones,
  Waveform,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { reportClientError } from '@/lib/clientErrorReporter'
import { cn } from '@/lib/utils'
import {
  API_CONFIG_HINTS,
  formatDurationMs,
  sortApiSources,
  type ApiOperationalState,
  type QueueOperationalState,
} from '@/lib/health/apiStatus'
import type { AlertSeverity, HealthResponse } from '@/lib/health/types'
import { describeSyncQueueIssue } from '@/lib/sync/userFacingErrors'
import { SyncAdvancedJobsPanel } from '@/components/admin/sync/SyncAdvancedJobsPanel'

interface SystemHealthWidgetProps {
  bearerToken: string
}

type SystemViewMode = 'guided' | 'advanced'

/** Reads response text first so Vercel/plain-text error pages never crash res.json(). */
async function parseAdminFetchJson(res: Response): Promise<Record<string, unknown>> {
  const rawText = await res.text()
  if (!rawText.trim()) return {}
  try {
    return JSON.parse(rawText) as Record<string, unknown>
  } catch {
    throw new Error(rawText.trim().slice(0, 200) || `Request failed (${res.status})`)
  }
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Never'
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const API_META: Record<string, { label: string; icon: React.ReactNode }> = {
  itunes: { label: 'iTunes', icon: <MusicNote size={16} weight="bold" aria-hidden="true" /> },
  spotify: { label: 'Spotify', icon: <Microphone size={16} weight="bold" aria-hidden="true" /> },
  discogs: { label: 'Discogs', icon: <RecordIcon size={16} weight="bold" aria-hidden="true" /> },
  songkick: { label: 'Songkick', icon: <Ticket size={16} weight="bold" aria-hidden="true" /> },
  bandsintown: { label: 'Bandsintown', icon: <Ticket size={16} weight="bold" aria-hidden="true" /> },
  youtube: { label: 'YouTube', icon: <YoutubeLogo size={16} weight="bold" aria-hidden="true" /> },
  odesli: { label: 'Odesli', icon: <Link size={16} weight="bold" aria-hidden="true" /> },
  lastfm: { label: 'Last.fm', icon: <Headphones size={16} weight="bold" aria-hidden="true" /> },
  soundcharts: { label: 'Soundcharts', icon: <Waveform size={16} weight="bold" aria-hidden="true" /> },
  apify: { label: 'Apify (Spotify public)', icon: <ChartLine size={16} weight="bold" aria-hidden="true" /> },
  all: { label: 'Full pipeline', icon: <ArrowsClockwise size={16} weight="bold" aria-hidden="true" /> },
}

/** Last.fm + Soundcharts share POST /api/admin/analytics/sync-listeners. */
const LISTENER_SYNC_APIS = new Set(['lastfm', 'soundcharts'])

function getApiMeta(api: string): { label: string; icon: React.ReactNode } {
  return (
    API_META[api] ?? {
      label: api.charAt(0).toUpperCase() + api.slice(1),
      icon: <MusicNote size={16} weight="bold" aria-hidden="true" />,
    }
  )
}

function apifySyncToastMessage(data: Record<string, unknown>): string {
  const urls = typeof data.urlsCharged === 'number' ? data.urlsCharged : 0
  const upserted =
    data.upserted && typeof data.upserted === 'object'
      ? (data.upserted as { listenerRows?: unknown; trackRows?: unknown })
      : null
  const listeners = typeof upserted?.listenerRows === 'number' ? upserted.listenerRows : 0
  const tracks = typeof upserted?.trackRows === 'number' ? upserted.trackRows : 0
  const partial = data.partial === true ? ' Partial run — re-run to continue.' : ''
  return `Apify (Spotify public) sync completed (${urls} URL${urls === 1 ? '' : 's'}, ${listeners} listener row${listeners === 1 ? '' : 's'}, ${tracks} track row${tracks === 1 ? '' : 's'}).${partial}`
}

function operationalBadgeClass(
  state: ApiOperationalState | QueueOperationalState | 'unconfigured',
): string {
  switch (state) {
    case 'operational':
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'idle':
    case 'unconfigured':
      return 'bg-muted text-muted-foreground border-border'
    case 'unavailable':
      return 'bg-muted/60 text-muted-foreground border-border'
    case 'stale':
    case 'degraded':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'failing':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function overallBadgeClass(status: HealthResponse['status']): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'degraded':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'unhealthy':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
  }
}

function healthScoreClass(score: number): string {
  if (score >= 85) return 'text-green-400'
  if (score >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function alertSeverityClass(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical':
      return 'border-red-500/40 bg-red-500/10'
    case 'warning':
      return 'border-yellow-500/40 bg-yellow-500/10'
    case 'info':
      return 'border-border bg-muted/40'
  }
}

function databaseCardClass(status: HealthResponse['database']['status']): string {
  switch (status) {
    case 'online':
      return 'border-green-500/30'
    case 'slow':
      return 'border-yellow-500/30'
    case 'critical':
      return 'border-red-500/30'
    case 'offline':
      return 'border-red-500/30'
  }
}

export function SystemHealthWidget({ bearerToken }: SystemHealthWidgetProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingYoutube, setSyncingYoutube] = useState(false)
  const [syncingApi, setSyncingApi] = useState<string | null>(null)
  const [expandedErrors, setExpandedErrors] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<SystemViewMode>('guided')

  const fetchHealth = useCallback(async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setRefreshing(true)
    try {
      const url = showRefreshSpinner
        ? '/api/health?mode=full&fresh=1'
        : '/api/health?mode=full'
      const res = await fetch(url, {
        headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
      })
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
      const data = (await parseAdminFetchJson(res)) as unknown as HealthResponse
      setHealth(data)
    } catch (err) {
      reportClientError('admin.health', err, { endpoint: '/api/health' }, 'warn')
      toast.error(`Health check failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
      if (showRefreshSpinner) setRefreshing(false)
    }
  }, [bearerToken])

  useEffect(() => {
    const pollIntervalMs = 120_000
    let interval: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (interval) return
      interval = setInterval(() => {
        void fetchHealth()
      }, pollIntervalMs)
    }

    const stopPolling = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopPolling()
        return
      }
      void fetchHealth()
      startPolling()
    }

    void fetchHealth()
    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchHealth])

  const handleForceSync = async () => {
    setSyncing(true)
    try {
      const resQueue = await fetch('/api/sync/queue', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
      })
      const dataQueue = await parseAdminFetchJson(resQueue)
      if (!resQueue.ok) {
        throw new Error(
          typeof dataQueue.error === 'string' ? dataQueue.error : `Queue failed (${resQueue.status})`,
        )
      }

      const resExecute = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
      })
      const dataExecute = await parseAdminFetchJson(resExecute)
      if (!resExecute.ok) {
        throw new Error(
          typeof dataExecute.error === 'string'
            ? dataExecute.error
            : `Execute failed (${resExecute.status})`,
        )
      }

      const queued = (dataQueue.queued as number | undefined) ?? 0
      toast.success(
        queued > 0
          ? `${queued} job(s) enqueued — background executor accepted the run.`
          : 'No new jobs enqueued (artists may already be queued). Executor started.',
      )

      await fetchHealth(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(message.includes('429') ? 'Sync failed: rate limit reached.' : `Sync failed: ${message}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncYoutube = async () => {
    setSyncingYoutube(true)
    try {
      const res = await fetch('/api/sync-youtube', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await parseAdminFetchJson(res)
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `YouTube sync failed (${res.status})`,
        )
      }

      const syncedCount = (data.synced as number | undefined) ?? (data.count as number | undefined)
      toast.success(
        typeof syncedCount === 'number'
          ? `YouTube sync completed (${syncedCount} video${syncedCount === 1 ? '' : 's'}).`
          : (typeof data.message === 'string' ? data.message : 'YouTube sync completed.'),
      )
      await fetchHealth(true)
    } catch (err) {
      toast.error(`YouTube sync failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncingYoutube(false)
    }
  }

  const handleSyncApi = async (api: string) => {
    setSyncingApi(api)
    try {
      // Apify is a separate analytics route (not Last.fm/Soundcharts sync-listeners).
      const res =
        api === 'apify'
          ? await fetch('/api/admin/analytics/sync-spotify-plays', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ scope: 'all' }),
            })
          : LISTENER_SYNC_APIS.has(api)
            ? await fetch('/api/admin/analytics/sync-listeners', {
                method: 'POST',
                headers: { Authorization: `Bearer ${bearerToken}` },
              })
            : await fetch('/api/sync-api', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${bearerToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ apiSource: api }),
              })

      const data = await parseAdminFetchJson(res)
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Sync failed (${res.status})`,
        )
      }

      if (api === 'apify') {
        toast.success(apifySyncToastMessage(data))
      } else if (LISTENER_SYNC_APIS.has(api)) {
        const rows =
          api === 'soundcharts'
            ? (data.soundchartsRows as number | undefined)
            : (data.lastfmRows as number | undefined)
        toast.success(
          `${getApiMeta(api).label} sync completed (${rows ?? 0} metric row${rows === 1 ? '' : 's'}).`,
        )
      } else if (api === 'spotify' || api === 'odesli') {
        const queued = data.queued as number | undefined
        // Kick the queue executor immediately so jobs do not wait for the 5-minute cron.
        if (typeof queued === 'number' && queued > 0) {
          void fetch('/api/sync', {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearerToken}` },
          })
        }
        toast.success(
          typeof queued === 'number' && queued > 0
            ? `${getApiMeta(api).label} sync queued (${queued} job${queued === 1 ? '' : 's'}) — executor started; public cache refreshes as jobs finish.`
            : (typeof data.message === 'string'
                ? data.message
                : `${getApiMeta(api).label} sync already queued.`),
        )
      } else {
        toast.success(`${getApiMeta(api).label} sync completed.`)
      }
      await fetchHealth(true)
    } catch (err) {
      toast.error(`${getApiMeta(api).label} sync failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncingApi(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!health) return null

  const dbOnline = health.database.status !== 'offline'
  const apiEntries = sortApiSources(Object.keys(health.apis))
    .filter((api) => api !== 'all')
    .map((api) => [api, health.apis[api]] as const)

  const criticalAlerts = health.alerts.filter((a) => a.severity === 'critical')
  const warningAlerts = health.alerts.filter((a) => a.severity === 'warning')

  const queueBacklog =
    (health.syncQueue?.pending ?? 0) +
    (health.syncQueue?.running ?? 0) +
    (health.syncQueue?.stuckRunning ?? 0)
  const executeJob = health.cronHealth?.jobs.find((j) => j.key === 'sync_execute')
  const youtubeJob = health.cronHealth?.jobs.find((j) => j.key === 'sync_youtube')
  const speakingIssues = describeSyncQueueIssue({
    executorNeverRan: executeJob?.statusLabel === 'Executor never ran',
    executorOffline:
      executeJob?.statusLabel === 'Executor offline' ||
      executeJob?.statusLabel === 'Executor overdue',
    backlog: queueBacklog,
    youtubeUnconfigured:
      youtubeJob?.operationalState === 'unconfigured' ||
      !(health.apis.youtube?.configured ?? false),
    youtubeIdle:
      Boolean(health.apis.youtube?.configured) &&
      (youtubeJob?.statusLabel === 'Awaiting first run' ||
        youtubeJob?.lastHeartbeatAt == null),
    cronSecretMissing:
      executeJob?.statusLabel === 'Automatic sync unavailable' ||
      executeJob?.statusLabel === 'Cron auth not configured',
  })

  const activeWork = queueBacklog > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={overallBadgeClass(health.status)} aria-label={`System status: ${health.statusLabel}`}>
              {health.status === 'unhealthy' && <XCircle size={12} className="mr-1" aria-hidden="true" />}
              {health.status === 'degraded' && <Warning size={12} className="mr-1" aria-hidden="true" />}
              {health.statusLabel}
            </Badge>
            <span
              className={cn('text-sm font-semibold tabular-nums', healthScoreClass(health.healthScore))}
              aria-label={`Health score ${health.healthScore} out of 100`}
            >
              <Gauge size={14} className="inline mr-1" aria-hidden="true" />
              {health.healthScore}/100
            </span>
            <span className="text-xs text-muted-foreground">
              Checked {formatRelativeTime(health.checkedAt)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{health.statusDetail}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex rounded-md border border-border p-0.5"
            role="group"
            aria-label="System view mode"
          >
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'guided' ? 'secondary' : 'ghost'}
              className="h-8"
              onClick={() => setViewMode('guided')}
            >
              Guided
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'advanced' ? 'secondary' : 'ghost'}
              className="h-8"
              onClick={() => setViewMode('advanced')}
            >
              Advanced
            </Button>
          </div>
          <Button
            onClick={() => { void fetchHealth(true) }}
            disabled={refreshing}
            size="sm"
            variant="ghost"
            aria-label="Refresh health status"
            className="min-w-[44px] min-h-[44px]"
          >
            <ArrowsClockwise
              size={16}
              className={cn(refreshing && 'animate-spin')}
              aria-hidden="true"
            />
          </Button>
          <Button
            onClick={() => { void handleSyncYoutube() }}
            disabled={syncingYoutube || !dbOnline}
            size="sm"
            variant="outline"
            aria-label="Sync YouTube channel videos"
          >
            {syncingYoutube ? (
              <>
                <Spinner size={14} className="mr-2 animate-spin" aria-hidden="true" />
                Syncing…
              </>
            ) : (
              <>
                <YoutubeLogo size={14} className="mr-2" aria-hidden="true" />
                Sync YouTube
              </>
            )}
          </Button>
          <Button
            onClick={() => { void handleForceSync() }}
            disabled={syncing || !dbOnline}
            size="sm"
            variant="outline"
            aria-label="Enqueue and execute sync queue jobs"
          >
            {syncing ? (
              <>
                <Spinner size={14} className="mr-2 animate-spin" aria-hidden="true" />
                Syncing…
              </>
            ) : (
              <>
                <ArrowsClockwise size={14} className="mr-2" aria-hidden="true" />
                Force Sync All
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Configured</p>
          <p className="text-lg font-semibold tabular-nums">{health.kpis.configuredApis}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Operational</p>
          <p className="text-lg font-semibold tabular-nums text-green-400">{health.kpis.operationalApis}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Degraded</p>
          <p className="text-lg font-semibold tabular-nums text-yellow-400">{health.kpis.degradedApis}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Failing</p>
          <p className="text-lg font-semibold tabular-nums text-red-400">{health.kpis.failingApis}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ChartLine size={12} aria-hidden="true" />
            24h SLA
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {health.kpis.avgSuccessRate24h !== null ? `${health.kpis.avgSuccessRate24h}%` : '—'}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Bell size={12} aria-hidden="true" />
            Alerts
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {criticalAlerts.length > 0 && (
              <span className="text-red-400">{criticalAlerts.length}</span>
            )}
            {criticalAlerts.length > 0 && warningAlerts.length > 0 && (
              <span className="text-muted-foreground mx-1">/</span>
            )}
            {warningAlerts.length > 0 && (
              <span className="text-yellow-400">{warningAlerts.length}</span>
            )}
            {criticalAlerts.length === 0 && warningAlerts.length === 0 && (
              <span className="text-green-400">0</span>
            )}
          </p>
        </Card>
      </div>

      {speakingIssues.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">What needs attention</CardTitle>
            <CardDescription>
              Product-facing sync issues you can act on from this dashboard. Hosting and scheduler
              setup is not managed here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {speakingIssues.map((issue) => (
                <li key={issue.title} className="rounded-md border border-border px-3 py-2 text-sm">
                  <p className="font-medium">{issue.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{issue.message}</p>
                  {issue.fixHint && (
                    <p className="text-xs text-foreground mt-1">
                      <span className="font-medium">Next step: </span>
                      {issue.fixHint}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {viewMode === 'advanced' && (
        <SyncAdvancedJobsPanel bearerToken={bearerToken} activeWork={activeWork} />
      )}

      {health.alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell size={16} weight="bold" aria-hidden="true" />
              Active Alerts
              <Badge variant="outline" className="ml-auto text-xs">
                {health.alerts.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              {criticalAlerts.length > 0
                ? `${criticalAlerts.length} critical · ${warningAlerts.length} warning`
                : 'No critical issues — review warnings below'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 max-h-[40vh] overflow-y-auto" data-lenis-prevent>
              {health.alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm',
                    alertSeverityClass(alert.severity),
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs capitalize',
                        alert.severity === 'critical' && 'border-red-500/40 text-red-400',
                        alert.severity === 'warning' && 'border-yellow-500/40 text-yellow-400',
                      )}
                      aria-label={`Severity: ${alert.severity}`}
                    >
                      {alert.severity}
                    </Badge>
                    <span className="font-medium">{alert.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className={databaseCardClass(health.database.status)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database size={16} weight="bold" aria-hidden="true" />
              Database
            </CardTitle>
            <CardDescription>{health.database.statusDetail}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {health.database.status === 'online' ? (
                <CheckCircle size={20} weight="fill" className="text-green-400" aria-hidden="true" />
              ) : health.database.status === 'slow' ? (
                <Warning size={20} weight="fill" className="text-yellow-400" aria-hidden="true" />
              ) : (
                <XCircle size={20} weight="fill" className="text-red-400" aria-hidden="true" />
              )}
              <span className="font-medium text-sm">{health.database.statusLabel}</span>
              {health.database.latencyMs !== null && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {health.database.latencyMs}ms round-trip
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {health.syncQueue && (
          <Card
            className={cn(
              health.syncQueue.operationalState === 'failing' && 'border-red-500/30',
              health.syncQueue.operationalState === 'degraded' && 'border-yellow-500/30',
              health.syncQueue.operationalState === 'operational' && 'border-green-500/30',
            )}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Queue size={16} weight="bold" aria-hidden="true" />
                Sync Queue
              </CardTitle>
              <CardDescription>{health.syncQueue.statusDetail}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge
                className={operationalBadgeClass(health.syncQueue.operationalState)}
                aria-label={`Sync queue: ${health.syncQueue.statusLabel}`}
              >
                {health.syncQueue.statusLabel}
              </Badge>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Pending: {health.syncQueue.pending}</Badge>
                <Badge variant="outline">Running: {health.syncQueue.running}</Badge>
                <Badge variant="outline">Done (24h): {health.syncQueue.done}</Badge>
                <Badge
                  variant="outline"
                  className={health.syncQueue.failed > 0 ? 'border-red-500/40 text-red-400' : undefined}
                >
                  Failed (24h): {health.syncQueue.failed}
                </Badge>
                {health.syncQueue.stuckRunning > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    Stuck: {health.syncQueue.stuckRunning}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {apiEntries.map(([api, status]) => {
          const meta = getApiMeta(api)
          const hasErrors =
            status.errorCount > 0 &&
            (status.lastSyncStatus === 'partial' || status.lastSyncStatus === 'error')
          const isExpanded = expandedErrors === api
          const durationLabel = formatDurationMs(status.durationMs)
          const slaLabel =
            status.stats24h.total > 0 && status.stats24h.successRate !== null
              ? `${status.stats24h.successRate}% (${status.stats24h.success}/${status.stats24h.total})`
              : null

          return (
            <Card
              key={api}
              className={cn(
                status.operationalState === 'failing' && 'border-red-500/30',
                (status.operationalState === 'degraded' ||
                  status.operationalState === 'stale') &&
                  'border-yellow-500/30',
                status.operationalState === 'operational' && 'border-green-500/30',
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {meta.icon}
                  {meta.label}
                </CardTitle>
                <CardDescription className="line-clamp-3">{status.statusDetail}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge
                  className={operationalBadgeClass(status.operationalState)}
                  aria-label={`${meta.label} status: ${status.statusLabel}`}
                >
                  {status.statusLabel}
                </Badge>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    Last run:{' '}
                    <span className="text-foreground font-medium">
                      {formatRelativeTime(status.lastSyncAt)}
                    </span>
                  </p>
                  {slaLabel && (
                    <p>
                      24h SLA:{' '}
                      <span
                        className={cn(
                          'font-medium',
                          status.stats24h.successRate !== null &&
                            status.stats24h.successRate < 80 &&
                            'text-yellow-400',
                          status.stats24h.successRate !== null &&
                            status.stats24h.successRate < 50 &&
                            'text-red-400',
                        )}
                      >
                        {slaLabel}
                      </span>
                    </p>
                  )}
                  {!status.configured && (
                    <p>{API_CONFIG_HINTS[api] ?? 'Configure in Admin → API Keys.'}</p>
                  )}
                  {api === 'discogs' && status.configured && status.operationalState === 'idle' && (
                    <p>Also runs inside Spotify sync when artists have a Discogs ID.</p>
                  )}
                  {api === 'bandsintown' && status.configured && (
                    <p>Keys are per artist on the profile; global key is an optional fallback.</p>
                  )}
                  {api === 'odesli' && status.configured && status.operationalState === 'idle' && (
                    <p>Resolves smart links from release album/track URLs.</p>
                  )}
                  {api === 'lastfm' && status.configured && (
                    <p>Syncs monthly listener trends for portal artists.</p>
                  )}
                  {api === 'soundcharts' && status.configured && (
                    <p>Optional paid listener analytics — requires Soundcharts UUID per artist.</p>
                  )}
                  {api === 'apify' && status.configured && (
                    <p>Scrapes public Spotify monthly listeners and track plays (budget-capped).</p>
                  )}
                </div>

                {(status.releasesSynced !== null ||
                  status.concertsSynced !== null ||
                  durationLabel) && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {status.releasesSynced !== null && status.releasesSynced > 0 && (
                      <li>
                        {status.releasesSynced}{' '}
                        {api === 'youtube'
                          ? 'video'
                          : api === 'lastfm' || api === 'soundcharts' || api === 'apify'
                            ? 'metric row'
                            : 'release'}
                        {status.releasesSynced === 1 ? '' : 's'} on last run
                      </li>
                    )}
                    {status.concertsSynced !== null && status.concertsSynced > 0 && (
                      <li>
                        {status.concertsSynced} concert{status.concertsSynced === 1 ? '' : 's'} on
                        last run
                      </li>
                    )}
                    {status.artistsProcessed !== null && status.artistsProcessed > 0 && (
                      <li>
                        {status.artistsProcessed} artist
                        {status.artistsProcessed === 1 ? '' : 's'} processed
                      </li>
                    )}
                    {durationLabel && <li>Duration: {durationLabel}</li>}
                  </ul>
                )}

                {status.rateLimited && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                    <Warning size={10} className="mr-1" aria-hidden="true" />
                    Rate limited
                  </Badge>
                )}

                {hasErrors && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setExpandedErrors(isExpanded ? null : api)}
                      className="text-xs text-red-400 underline underline-offset-2 hover:text-red-300 focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent rounded min-h-[44px]"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Hide errors' : `Show ${status.errorCount} error(s)`}
                    </button>
                    {isExpanded && (
                      <ul
                        className="mt-2 space-y-1 max-h-40 overflow-y-auto"
                        data-lenis-prevent
                      >
                        {status.lastErrors.map((err, i) => (
                          <li
                            key={i}
                            className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1 font-mono break-all"
                          >
                            {err}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    disabled={
                      !dbOnline ||
                      !status.configured ||
                      status.operationalState === 'unavailable' ||
                      syncingApi === api ||
                      syncing
                    }
                    onClick={() => { void handleSyncApi(api) }}
                    aria-label={`Force sync ${meta.label}`}
                  >
                    {syncingApi === api ? (
                      <ArrowsClockwise size={10} className="mr-1 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowsClockwise size={10} className="mr-1" aria-hidden="true" />
                    )}
                    Force Sync
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}