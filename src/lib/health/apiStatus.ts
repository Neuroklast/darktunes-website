/**
 * src/lib/health/apiStatus.ts
 *
 * Derives human-readable operational states for the admin health dashboard.
 * Pure functions — fully unit-testable without DB or network.
 */

export const API_SOURCE_ORDER = [
  'itunes',
  'spotify',
  'discogs',
  'songkick',
  'bandsintown',
  'lastfm',
  'soundcharts',
  'apify',
  'youtube',
  'all',
] as const

/** How to configure each integration (stored in Admin → API Keys unless noted). */
export const API_CONFIG_HINTS: Record<string, string> = {
  itunes: 'No API key required — uses the public Apple Music lookup API.',
  spotify: 'Add Spotify Client ID and Client Secret in Admin → API Keys.',
  discogs: 'Add a Discogs personal access token in Admin → API Keys.',
  songkick: 'Add a Songkick API key in Admin → API Keys.',
  bandsintown:
    'Per-artist API keys on artist profiles, or a global fallback key in Admin → API Keys.',
  lastfm: 'Add a Last.fm API key in Admin → API Keys. Artists need a Last.fm name.',
  soundcharts: 'Optional — add a Soundcharts API key in Admin → API Keys.',
  apify: 'Add an Apify API token in Admin → API Keys (Spotify public play counts).',
  youtube: 'Add YouTube API key and Channel ID in Admin → API Keys.',
}

/** Map historical/alias sync_logs.api_source values onto health card keys. */
export function normalizeHealthApiSource(apiSource: string): string {
  if (apiSource === 'apify_spotify') return 'apify'
  return apiSource
}

/** Sync crons run daily; flag as stale after 36 hours without a successful run. */
export const STALE_SYNC_MS = 36 * 60 * 60 * 1000

export type ApiOperationalState =
  | 'operational'
  | 'degraded'
  | 'failing'
  | 'unconfigured'
  | 'idle'
  | 'stale'
  | 'unavailable'

export type HealthOverallStatus = 'healthy' | 'degraded' | 'unhealthy'

export type QueueOperationalState = 'operational' | 'degraded' | 'failing' | 'idle'

export interface SyncLogSnapshot {
  createdAt: string
  status: 'success' | 'partial' | 'error'
  rateLimited: boolean
  errors: string[]
  durationMs: number | null
  releasesSynced: number
  artistsProcessed: number | null
  concertsSynced: number | null
}

export interface DerivedApiHealth {
  operationalState: ApiOperationalState
  statusLabel: string
  statusDetail: string
}

export interface SyncQueueSnapshot {
  pending: number
  running: number
  done: number
  failed: number
  stuckRunning: number
}

export interface DerivedQueueHealth {
  operationalState: QueueOperationalState
  statusLabel: string
  statusDetail: string
}

export interface DerivedOverallHealth {
  status: HealthOverallStatus
  statusLabel: string
  statusDetail: string
}

export function formatDurationMs(ms: number | null): string | null {
  if (ms === null || ms < 0) return null
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remSec = Math.round(seconds % 60)
  return remSec > 0 ? `${minutes}m ${remSec}s` : `${minutes}m`
}

function formatSyncMetrics(
  api: string,
  snapshot: SyncLogSnapshot,
): string {
  const parts: string[] = []

  if (snapshot.releasesSynced > 0) {
    const unit =
      api === 'youtube'
        ? 'video'
        : api === 'lastfm' || api === 'soundcharts' || api === 'apify'
          ? 'metric row'
          : 'release'
    parts.push(
      `${snapshot.releasesSynced} ${unit}${snapshot.releasesSynced === 1 ? '' : 's'}`,
    )
  }

  if (snapshot.concertsSynced !== null && snapshot.concertsSynced > 0) {
    parts.push(
      `${snapshot.concertsSynced} concert${snapshot.concertsSynced === 1 ? '' : 's'}`,
    )
  }

  if (snapshot.artistsProcessed !== null && snapshot.artistsProcessed > 0) {
    parts.push(
      `${snapshot.artistsProcessed} artist${snapshot.artistsProcessed === 1 ? '' : 's'}`,
    )
  }

  const duration = formatDurationMs(snapshot.durationMs)
  if (duration) parts.push(duration)

  return parts.length > 0 ? parts.join(' · ') : 'No items synced'
}

function isStale(lastSyncAt: string, nowMs: number): boolean {
  return nowMs - new Date(lastSyncAt).getTime() > STALE_SYNC_MS
}

export function deriveApiHealth(
  api: string,
  configured: boolean,
  snapshot: SyncLogSnapshot | null,
  nowMs: number = Date.now(),
): DerivedApiHealth {
  if (!configured) {
    return {
      operationalState: 'unconfigured',
      statusLabel: 'Not configured',
      statusDetail:
        API_CONFIG_HINTS[api] ??
        'Add the required credentials in Admin → API Keys.',
    }
  }

  if (!snapshot) {
    return {
      operationalState: 'idle',
      statusLabel: 'Awaiting first sync',
      statusDetail: 'No sync_logs entry yet — run a manual or cron sync to establish a baseline.',
    }
  }

  const metrics = formatSyncMetrics(api, snapshot)
  const errorCount = snapshot.errors.length

  if (snapshot.rateLimited) {
    return {
      operationalState: 'degraded',
      statusLabel: 'Rate limited',
      statusDetail: `Last run was throttled by the provider. ${metrics}`,
    }
  }

  if (snapshot.status === 'error') {
    return {
      operationalState: 'failing',
      statusLabel: 'Last run failed',
      statusDetail:
        errorCount > 0
          ? `${errorCount} error${errorCount === 1 ? '' : 's'} on last run. ${metrics}`
          : `Last run failed with no detailed errors. ${metrics}`,
    }
  }

  if (snapshot.status === 'partial') {
    return {
      operationalState: 'degraded',
      statusLabel: 'Partial success',
      statusDetail:
        errorCount > 0
          ? `${errorCount} warning${errorCount === 1 ? '' : 's'} on last run. ${metrics}`
          : `Last run completed with warnings. ${metrics}`,
    }
  }

  if (isStale(snapshot.createdAt, nowMs)) {
    return {
      operationalState: 'stale',
      statusLabel: 'Sync overdue',
      statusDetail: `Last successful run is older than 36 hours. ${metrics}`,
    }
  }

  return {
    operationalState: 'operational',
    statusLabel: 'Operational',
    statusDetail: `Last run succeeded. ${metrics}`,
  }
}

export function deriveSyncQueueHealth(snapshot: SyncQueueSnapshot): DerivedQueueHealth {
  const { pending, running, done, failed, stuckRunning } = snapshot
  const active = pending + running

  if (stuckRunning > 0) {
    return {
      operationalState: 'failing',
      statusLabel: 'Stuck jobs detected',
      statusDetail: `${stuckRunning} job${stuckRunning === 1 ? '' : 's'} exceeded the visibility timeout and need recovery.`,
    }
  }

  if (failed > 0 && active === 0) {
    return {
      operationalState: 'failing',
      statusLabel: 'Failed jobs backlog',
      statusDetail: `${failed} permanently failed job${failed === 1 ? '' : 's'} in the last 24h — re-queue from Maintenance.`,
    }
  }

  if (failed > 0) {
    return {
      operationalState: 'degraded',
      statusLabel: 'Retries in progress',
      statusDetail: `${failed} failed · ${pending} pending · ${running} running (24h window).`,
    }
  }

  if (pending > 50) {
    return {
      operationalState: 'degraded',
      statusLabel: 'Large backlog',
      statusDetail: `${pending} jobs waiting — cron executor will drain the queue over multiple runs.`,
    }
  }

  if (running > 0 || pending > 0) {
    return {
      operationalState: 'operational',
      statusLabel: 'Processing',
      statusDetail: `${pending} pending · ${running} running · ${done} completed (24h).`,
    }
  }

  if (done === 0) {
    return {
      operationalState: 'idle',
      statusLabel: 'Queue idle',
      statusDetail: 'No sync_queue activity in the last 24 hours.',
    }
  }

  return {
    operationalState: 'operational',
    statusLabel: 'Queue healthy',
    statusDetail: `${done} job${done === 1 ? '' : 's'} completed in the last 24 hours.`,
  }
}

const STATE_SEVERITY: Record<ApiOperationalState, number> = {
  operational: 0,
  idle: 1,
  stale: 2,
  degraded: 3,
  failing: 4,
  unconfigured: 1,
  unavailable: 0,
}

const QUEUE_SEVERITY: Record<QueueOperationalState, number> = {
  idle: 0,
  operational: 0,
  degraded: 2,
  failing: 4,
}

export function deriveOverallHealth(
  dbOnline: boolean,
  apiStates: ApiOperationalState[],
  queueState: QueueOperationalState | null,
): DerivedOverallHealth {
  if (!dbOnline) {
    return {
      status: 'unhealthy',
      statusLabel: 'Database unreachable',
      statusDetail: 'Supabase ping failed — public site reads and sync jobs cannot run.',
    }
  }

  const maxApiSeverity = apiStates.reduce(
    (max, state) => Math.max(max, STATE_SEVERITY[state]),
    0,
  )
  const queueSeverity = queueState !== null ? QUEUE_SEVERITY[queueState] : 0
  const maxSeverity = Math.max(maxApiSeverity, queueSeverity)

  const failingApis = apiStates.filter((s) => s === 'failing').length
  const degradedApis = apiStates.filter(
    (s) => s === 'degraded' || s === 'stale' || s === 'failing',
  ).length

  if (maxSeverity >= 4 || queueState === 'failing') {
    const parts: string[] = []
    if (failingApis > 0) parts.push(`${failingApis} API${failingApis === 1 ? '' : 's'} failing`)
    if (queueState === 'failing') parts.push('sync queue needs attention')
    return {
      status: 'unhealthy',
      statusLabel: 'Action required',
      statusDetail:
        parts.length > 0
          ? parts.join(' · ')
          : 'One or more integrations reported a hard failure on the last run.',
    }
  }

  if (maxSeverity >= 2) {
    return {
      status: 'degraded',
      statusLabel: 'Degraded performance',
      statusDetail:
        degradedApis > 0
          ? `${degradedApis} integration${degradedApis === 1 ? '' : 's'} need review (stale, partial, or throttled).`
          : 'Background sync queue has elevated backlog or retry activity.',
    }
  }

  return {
    status: 'healthy',
    statusLabel: 'All systems operational',
    statusDetail: 'Database online and all configured integrations report a recent healthy sync.',
  }
}

export function sortApiSources(sources: string[]): string[] {
  const orderIndex = new Map(API_SOURCE_ORDER.map((s, i) => [s, i]))
  return [...sources].sort((a, b) => {
    const ai = orderIndex.get(a as (typeof API_SOURCE_ORDER)[number]) ?? 999
    const bi = orderIndex.get(b as (typeof API_SOURCE_ORDER)[number]) ?? 999
    if (ai !== bi) return ai - bi
    return a.localeCompare(b)
  })
}

export function parseSyncLogSnapshot(row: {
  created_at: string
  status: string
  rate_limited: boolean
  errors: unknown
  duration_ms: number | null
  releases_synced: number
  metadata: unknown
}): SyncLogSnapshot {
  const rawErrors = row.errors
  const errors: string[] = Array.isArray(rawErrors)
    ? (rawErrors as unknown[]).map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
    : []

  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}

  const artistsProcessed =
    typeof metadata.artists_processed === 'number' ? metadata.artists_processed : null
  const concertsSynced =
    typeof metadata.concerts_synced === 'number' ? metadata.concerts_synced : null

  return {
    createdAt: row.created_at,
    status: row.status as SyncLogSnapshot['status'],
    rateLimited: row.rate_limited,
    errors,
    durationMs: row.duration_ms,
    releasesSynced: row.releases_synced,
    artistsProcessed,
    concertsSynced,
  }
}