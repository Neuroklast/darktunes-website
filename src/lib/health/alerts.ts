/**
 * src/lib/health/alerts.ts
 *
 * Generates actionable health alerts from snapshot data.
 */

import type { ApiOperationalState } from './apiStatus'
import {
  MIN_RUNS_FOR_SLA,
  QUEUE_BACKLOG_WARN,
  SLA_SUCCESS_RATE_CRITICAL,
  SLA_SUCCESS_RATE_WARN,
} from './thresholds'
import type { CronHealthSummary } from './cronHeartbeat'
import type {
  ApiHealthStatus,
  DatabaseHealth,
  HealthAlert,
  HealthKpiSummary,
  SyncQueueHealth,
} from './types'

const SEVERITY_ORDER: Record<HealthAlert['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

export function sortAlerts(alerts: HealthAlert[]): HealthAlert[] {
  return [...alerts].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return a.title.localeCompare(b.title)
  })
}

export function deriveUnavailableApiHealth(): {
  operationalState: ApiOperationalState
  statusLabel: string
  statusDetail: string
} {
  return {
    operationalState: 'unavailable',
    statusLabel: 'Status unavailable',
    statusDetail: 'Cannot read sync_logs — database is unreachable or health probe failed.',
  }
}

export function buildHealthAlerts(
  database: DatabaseHealth,
  apis: Record<string, ApiHealthStatus>,
  syncQueue: SyncQueueHealth | null,
  kpis: HealthKpiSummary,
  cronHealth: CronHealthSummary | null = null,
): HealthAlert[] {
  const alerts: HealthAlert[] = []

  if (database.status === 'offline') {
    alerts.push({
      id: 'db-offline',
      severity: 'critical',
      title: 'Database unreachable',
      message: database.statusDetail,
      source: 'database',
    })
  } else if (database.status === 'critical') {
    alerts.push({
      id: 'db-latency-critical',
      severity: 'critical',
      title: 'Database latency critical',
      message: database.statusDetail,
      source: 'database',
    })
  } else if (database.status === 'slow') {
    alerts.push({
      id: 'db-latency-warn',
      severity: 'warning',
      title: 'Database latency elevated',
      message: database.statusDetail,
      source: 'database',
    })
  }

  if (syncQueue) {
    if (syncQueue.operationalState === 'failing') {
      alerts.push({
        id: 'queue-failing',
        severity: 'critical',
        title: syncQueue.statusLabel,
        message: syncQueue.statusDetail,
        source: 'sync_queue',
      })
    } else if (syncQueue.operationalState === 'degraded') {
      alerts.push({
        id: 'queue-degraded',
        severity: 'warning',
        title: syncQueue.statusLabel,
        message: syncQueue.statusDetail,
        source: 'sync_queue',
      })
    } else if (syncQueue.pending > QUEUE_BACKLOG_WARN) {
      alerts.push({
        id: 'queue-backlog',
        severity: 'warning',
        title: 'Sync queue backlog',
        message: `${syncQueue.pending} jobs pending — executor will drain over multiple cron runs.`,
        source: 'sync_queue',
      })
    }
  }

  for (const [api, status] of Object.entries(apis)) {
    if (api === 'all') continue

    if (status.operationalState === 'failing') {
      alerts.push({
        id: `api-${api}-failing`,
        severity: 'critical',
        title: `${formatApiName(api)} failing`,
        message: status.statusDetail,
        source: api,
      })
    } else if (status.operationalState === 'stale') {
      alerts.push({
        id: `api-${api}-stale`,
        severity: 'warning',
        title: `${formatApiName(api)} sync overdue`,
        message: status.statusDetail,
        source: api,
      })
    } else if (status.operationalState === 'degraded') {
      alerts.push({
        id: `api-${api}-degraded`,
        severity: 'warning',
        title: `${formatApiName(api)} degraded`,
        message: status.statusDetail,
        source: api,
      })
    }

    const { stats24h } = status
    if (
      status.configured &&
      stats24h.total >= MIN_RUNS_FOR_SLA &&
      stats24h.successRate !== null
    ) {
      if (stats24h.successRate < SLA_SUCCESS_RATE_CRITICAL) {
        alerts.push({
          id: `api-${api}-sla-critical`,
          severity: 'critical',
          title: `${formatApiName(api)} SLA breach`,
          message: `24h success rate ${stats24h.successRate}% (${stats24h.success}/${stats24h.total} runs).`,
          source: api,
        })
      } else if (stats24h.successRate < SLA_SUCCESS_RATE_WARN) {
        alerts.push({
          id: `api-${api}-sla-warn`,
          severity: 'warning',
          title: `${formatApiName(api)} SLA warning`,
          message: `24h success rate ${stats24h.successRate}% (${stats24h.success}/${stats24h.total} runs).`,
          source: api,
        })
      }
    }
  }

  if (kpis.unconfiguredApis > 0) {
    alerts.push({
      id: 'apis-unconfigured',
      severity: 'info',
      title: 'Optional integrations not configured',
      message: `${kpis.unconfiguredApis} integration${kpis.unconfiguredApis === 1 ? '' : 's'} not configured in Admin → API Keys — sync for those sources is disabled.`,
      source: 'system',
    })
  }

  if (
    database.status === 'online' &&
    kpis.configuredApis > 0 &&
    kpis.idleApis === kpis.configuredApis
  ) {
    alerts.push({
      id: 'apis-all-idle',
      severity: 'info',
      title: 'No sync baseline yet',
      message: 'All configured integrations are awaiting their first sync_logs entry.',
      source: 'system',
    })
  }

  if (cronHealth) {
    for (const job of cronHealth.jobs) {
      if (job.operationalState === 'failing') {
        alerts.push({
          id: `cron-${job.key}-failing`,
          severity: 'critical',
          title: `${job.label} cron failing`,
          message: job.statusDetail,
          source: 'cron',
        })
      } else if (job.operationalState === 'degraded') {
        alerts.push({
          id: `cron-${job.key}-degraded`,
          severity: 'warning',
          title: `${job.label} cron overdue`,
          message: job.statusDetail,
          source: 'cron',
        })
      }
    }
  }

  return sortAlerts(alerts)
}

export function buildCriticalAlertFingerprint(alerts: HealthAlert[]): string {
  return alerts
    .filter((a) => a.severity === 'critical')
    .map((a) => a.id)
    .sort()
    .join(',')
}

export function computeHealthScore(
  database: DatabaseHealth,
  apis: Record<string, ApiHealthStatus>,
  syncQueue: SyncQueueHealth | null,
  cronHealth: CronHealthSummary | null = null,
): number {
  if (database.status === 'offline') return 0

  let score = 100

  if (database.status === 'critical') score -= 25
  else if (database.status === 'slow') score -= 10

  for (const [api, status] of Object.entries(apis)) {
    if (api === 'all' || !status.configured) continue

    switch (status.operationalState) {
      case 'failing':
        score -= 15
        break
      case 'degraded':
        score -= 8
        break
      case 'stale':
        score -= 6
        break
      default:
        break
    }

    const rate = status.stats24h.successRate
    if (
      status.stats24h.total >= MIN_RUNS_FOR_SLA &&
      rate !== null
    ) {
      if (rate < SLA_SUCCESS_RATE_CRITICAL) score -= 15
      else if (rate < SLA_SUCCESS_RATE_WARN) score -= 5
    }
  }

  if (syncQueue?.operationalState === 'failing') score -= 20
  else if (syncQueue?.operationalState === 'degraded') score -= 10

  if (cronHealth?.operationalState === 'failing') score -= 20
  else if (cronHealth?.operationalState === 'degraded') score -= 8

  return Math.max(0, Math.min(100, Math.round(score)))
}

export function computeKpiSummary(apis: Record<string, ApiHealthStatus>): HealthKpiSummary {
  let configuredApis = 0
  let operationalApis = 0
  let degradedApis = 0
  let failingApis = 0
  let staleApis = 0
  let unconfiguredApis = 0
  let idleApis = 0
  const rates: number[] = []

  for (const [api, status] of Object.entries(apis)) {
    if (api === 'all') continue

    if (status.configured) {
      configuredApis++
      switch (status.operationalState) {
        case 'operational':
          operationalApis++
          break
        case 'degraded':
          degradedApis++
          break
        case 'failing':
          failingApis++
          break
        case 'stale':
          staleApis++
          degradedApis++
          break
        case 'idle':
          idleApis++
          break
        default:
          break
      }

      if (
        status.stats24h.total >= MIN_RUNS_FOR_SLA &&
        status.stats24h.successRate !== null
      ) {
        rates.push(status.stats24h.successRate)
      }
    } else {
      unconfiguredApis++
    }
  }

  const avgSuccessRate24h =
    rates.length > 0
      ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
      : null

  return {
    configuredApis,
    operationalApis,
    degradedApis,
    failingApis,
    staleApis,
    unconfiguredApis,
    idleApis,
    avgSuccessRate24h,
  }
}

function formatApiName(api: string): string {
  if (api === 'itunes') return 'iTunes'
  if (api === 'lastfm') return 'Last.fm'
  if (api === 'soundcharts') return 'Soundcharts'
  return api.charAt(0).toUpperCase() + api.slice(1)
}