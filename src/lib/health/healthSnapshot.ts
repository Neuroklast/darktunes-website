/**
 * src/lib/health/healthSnapshot.ts
 *
 * Builds the full enterprise health snapshot from Supabase data.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { countStuckSyncJobs, getSyncQueueStats } from '@/lib/api/syncQueue'
import {
  buildHealthAlerts,
  computeHealthScore,
  computeKpiSummary,
  deriveUnavailableApiHealth,
} from './alerts'
import { deriveCronHealth } from './cronHeartbeat'
import { getHealthHeartbeats } from './heartbeats'
import {
  deriveApiHealth,
  deriveOverallHealth,
  deriveSyncQueueHealth,
  normalizeHealthApiSource,
  parseSyncLogSnapshot,
  sortApiSources,
  type ApiOperationalState,
} from './apiStatus'
import { HEALTH_LOG_STATS_FETCH_LIMIT, HEALTH_LOG_STATS_LOOKBACK_MS } from './thresholds'
import { checkDatabaseLiveness, deriveDatabaseHealth } from './healthLiveness'
import type { CronHealthSummary } from './cronHeartbeat'
import type {
  ApiHealthStatus,
  ApiRunStats24h,
  HealthResponse,
  SyncQueueHealth,
} from './types'
import { getKnownApiConfiguration } from '@/lib/secrets/getExternalCredentials'

const SYNC_LOG_HEALTH_SELECT =
  'api_source, created_at, status, rate_limited, errors, duration_ms, releases_synced, metadata' as const

/** DB api_source values that map onto a single health card key. */
export function dbApiSourcesForHealthKey(api: string): string[] {
  if (api === 'apify') return ['apify', 'apify_spotify']
  return [api]
}

/** Fallback when DB is unavailable — only always-on APIs marked configured. */
export function getKnownApisFallback(): Record<string, boolean> {
  return {
    itunes: true,
    spotify: false,
    discogs: false,
    songkick: false,
    bandsintown: false,
    odesli: true,
    lastfm: false,
    soundcharts: false,
    apify: false,
    youtube: false,
  }
}

interface SyncLogRow {
  api_source: string
  created_at: string
  status: string
  rate_limited: boolean
  errors: unknown
  duration_ms: number | null
  releases_synced: number
  metadata: unknown
}

function emptyStats24h(): ApiRunStats24h {
  return { total: 0, success: 0, partial: 0, error: 0, successRate: null }
}

function accumulateStats24h(
  stats: Map<string, ApiRunStats24h>,
  api: string,
  status: string,
  cutoff24hMs: number,
  createdAtMs: number,
): void {
  if (createdAtMs < cutoff24hMs) return

  const current = stats.get(api) ?? emptyStats24h()
  current.total++

  if (status === 'success') current.success++
  else if (status === 'partial') current.partial++
  else if (status === 'error') current.error++

  stats.set(api, current)
}

function finalizeStats24h(stats: Map<string, ApiRunStats24h>): Map<string, ApiRunStats24h> {
  const result = new Map<string, ApiRunStats24h>()
  for (const [api, raw] of stats) {
    const successRate =
      raw.total > 0 ? Math.round((raw.success / raw.total) * 100) : null
    result.set(api, { ...raw, successRate })
  }
  return result
}

function buildUnavailableApis(knownApis: Record<string, boolean>): Record<string, ApiHealthStatus> {
  const unavailable = deriveUnavailableApiHealth()
  const apis: Record<string, ApiHealthStatus> = {}

  for (const api of sortApiSources(Object.keys(knownApis))) {
    apis[api] = {
      configured: knownApis[api],
      operationalState: unavailable.operationalState,
      statusLabel: unavailable.statusLabel,
      statusDetail: unavailable.statusDetail,
      lastSyncAt: null,
      lastSyncStatus: null,
      rateLimited: false,
      lastErrors: [],
      durationMs: null,
      releasesSynced: null,
      concertsSynced: null,
      artistsProcessed: null,
      errorCount: 0,
      stats24h: emptyStats24h(),
    }
  }

  return apis
}

/**
 * Latest sync_logs row per health card — one limit(1) query per source (no lookback).
 * Avoids a global recent-N query where a chatty API buries others as "Never".
 */
export async function fetchLatestSyncLogsByApi(
  db: SupabaseClient<Database>,
  apiKeys: string[],
): Promise<Map<string, ReturnType<typeof parseSyncLogSnapshot>>> {
  const latestPerApi = new Map<string, ReturnType<typeof parseSyncLogSnapshot>>()

  await Promise.all(
    apiKeys.map(async (api) => {
      if (api === 'all') return

      let bestRow: SyncLogRow | null = null

      for (const source of dbApiSourcesForHealthKey(api)) {
        const { data, error } = await db
          .from('sync_logs')
          .select(SYNC_LOG_HEALTH_SELECT)
          .eq('api_source', source)
          .order('created_at', { ascending: false })
          .limit(1)

        if (error) {
          throw new Error(`Failed to read latest sync_logs for ${source}: ${error.message}`)
        }

        const row = ((data ?? []) as SyncLogRow[])[0]
        if (!row) continue
        if (!bestRow || row.created_at > bestRow.created_at) {
          bestRow = row
        }
      }

      if (bestRow) {
        latestPerApi.set(api, parseSyncLogSnapshot(bestRow))
      }
    }),
  )

  return latestPerApi
}

/** Aggregate 24h success/partial/error counts for SLA KPIs. */
export async function fetchSyncLogStats24h(
  db: SupabaseClient<Database>,
  cutoff24hIso: string,
  cutoff24hMs: number,
): Promise<Map<string, ApiRunStats24h>> {
  const { data: logs, error } = await db
    .from('sync_logs')
    .select('api_source, created_at, status')
    .gte('created_at', cutoff24hIso)
    .order('created_at', { ascending: false })
    .limit(HEALTH_LOG_STATS_FETCH_LIMIT)

  if (error) {
    throw new Error(`Failed to read sync_logs stats: ${error.message}`)
  }

  const statsAccumulator = new Map<string, ApiRunStats24h>()
  for (const row of (logs ?? []) as Pick<SyncLogRow, 'api_source' | 'created_at' | 'status'>[]) {
    accumulateStats24h(
      statsAccumulator,
      normalizeHealthApiSource(row.api_source),
      row.status,
      cutoff24hMs,
      new Date(row.created_at).getTime(),
    )
  }
  return finalizeStats24h(statsAccumulator)
}

export interface BuildHealthSnapshotDeps {
  db: SupabaseClient<Database> | null
  knownApis?: Record<string, boolean>
  nowMs?: number
}

export async function buildHealthSnapshot(
  deps: BuildHealthSnapshotDeps,
): Promise<HealthResponse> {
  const checkedAt = new Date().toISOString()
  const nowMs = deps.nowMs ?? Date.now()
  const knownApis =
    deps.knownApis ??
    (deps.db ? await getKnownApiConfiguration(deps.db) : getKnownApisFallback())
  const cutoff24hMs = nowMs - HEALTH_LOG_STATS_LOOKBACK_MS
  const cutoff24hIso = new Date(cutoff24hMs).toISOString()

  let database = deriveDatabaseHealth(false, null)
  let apis: Record<string, ApiHealthStatus> = buildUnavailableApis(knownApis)
  let syncQueueHealth: SyncQueueHealth | null = null
  let cronHealth: CronHealthSummary | null = null

  if (deps.db) {
    try {
      database = await checkDatabaseLiveness(deps.db)
      const dbOnline = database.status !== 'offline'

      if (dbOnline) {
        const knownKeys = sortApiSources(Object.keys(knownApis))
        const [latestPerApi, stats24h, queueStats, stuckRunning] = await Promise.all([
          fetchLatestSyncLogsByApi(deps.db, knownKeys),
          fetchSyncLogStats24h(deps.db, cutoff24hIso, cutoff24hMs),
          getSyncQueueStats(deps.db),
          countStuckSyncJobs(deps.db),
        ])

        // Include any api_source seen in stats that is not in knownApis (legacy keys).
        const allApis = sortApiSources([
          ...new Set([...knownKeys, ...latestPerApi.keys(), ...stats24h.keys()]),
        ])

        const builtApis: Record<string, ApiHealthStatus> = {}

        for (const api of allApis) {
          if (api === 'all') continue
          const snapshot = latestPerApi.get(api) ?? null
          const configured = knownApis[api] ?? false
          const derived = deriveApiHealth(api, configured, snapshot, nowMs)
          const apiStats = stats24h.get(api) ?? emptyStats24h()

          builtApis[api] = {
            configured,
            operationalState: derived.operationalState,
            statusLabel: derived.statusLabel,
            statusDetail: derived.statusDetail,
            lastSyncAt: snapshot?.createdAt ?? null,
            lastSyncStatus: snapshot?.status ?? null,
            rateLimited: snapshot?.rateLimited ?? false,
            lastErrors: snapshot?.errors ?? [],
            durationMs: snapshot?.durationMs ?? null,
            releasesSynced: snapshot?.releasesSynced ?? null,
            concertsSynced: snapshot?.concertsSynced ?? null,
            artistsProcessed: snapshot?.artistsProcessed ?? null,
            errorCount: snapshot?.errors.length ?? 0,
            stats24h: apiStats,
          }
        }

        apis = builtApis

        const queueDerived = deriveSyncQueueHealth({ ...queueStats, stuckRunning })
        syncQueueHealth = {
          ...queueStats,
          stuckRunning,
          operationalState: queueDerived.operationalState,
          statusLabel: queueDerived.statusLabel,
          statusDetail: queueDerived.statusDetail,
        }

        const heartbeats = await getHealthHeartbeats(deps.db)
        cronHealth = deriveCronHealth({
          heartbeats,
          syncQueue: syncQueueHealth,
          cronSecretConfigured: Boolean(process.env.CRON_SECRET),
          youtubeConfigured: knownApis.youtube ?? false,
          nowMs,
        })
      }
    } catch {
      database = deriveDatabaseHealth(false, null)
      apis = buildUnavailableApis(knownApis)
    }
  }

  const configuredApiStates = Object.entries(apis)
    .filter(([api, s]) => s.configured && api !== 'all')
    .map(([, s]) => s.operationalState as ApiOperationalState)

  let overall = deriveOverallHealth(
    database.status !== 'offline',
    configuredApiStates.filter((s) => s !== 'unavailable'),
    syncQueueHealth?.operationalState ?? null,
  )

  if (cronHealth?.operationalState === 'failing') {
    overall = {
      status: 'unhealthy',
      statusLabel: 'Cron scheduler failure',
      statusDetail: cronHealth.statusDetail,
    }
  } else if (
    cronHealth?.operationalState === 'degraded' &&
    overall.status === 'healthy'
  ) {
    overall = {
      status: 'degraded',
      statusLabel: 'Cron scheduler degraded',
      statusDetail: cronHealth.statusDetail,
    }
  }

  const kpis = computeKpiSummary(apis)
  const alerts = buildHealthAlerts(database, apis, syncQueueHealth, kpis, cronHealth)
  const healthScore = computeHealthScore(database, apis, syncQueueHealth, cronHealth)

  return {
    status: overall.status,
    statusLabel: overall.statusLabel,
    statusDetail: overall.statusDetail,
    healthScore,
    database,
    apis,
    syncQueue: syncQueueHealth,
    cronHealth,
    kpis,
    alerts,
    checkedAt,
  }
}