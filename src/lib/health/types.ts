/**
 * src/lib/health/types.ts
 *
 * Shared health monitoring types for API route and admin dashboard.
 */

import type {
  ApiOperationalState,
  HealthOverallStatus,
  QueueOperationalState,
} from './apiStatus'
import type { CronHealthSummary } from './cronHeartbeat'

export type AlertSeverity = 'critical' | 'warning' | 'info'

export type DatabaseOperationalState = 'online' | 'offline' | 'slow' | 'critical'

export interface HealthAlert {
  id: string
  severity: AlertSeverity
  title: string
  message: string
  source: 'database' | 'sync_queue' | 'system' | string
}

export interface ApiRunStats24h {
  total: number
  success: number
  partial: number
  error: number
  successRate: number | null
}

export interface ApiHealthStatus {
  configured: boolean
  operationalState: ApiOperationalState
  statusLabel: string
  statusDetail: string
  lastSyncAt: string | null
  lastSyncStatus: 'success' | 'partial' | 'error' | null
  rateLimited: boolean
  lastErrors: string[]
  durationMs: number | null
  releasesSynced: number | null
  concertsSynced: number | null
  artistsProcessed: number | null
  errorCount: number
  stats24h: ApiRunStats24h
}

export interface SyncQueueHealth {
  pending: number
  running: number
  done: number
  failed: number
  stuckRunning: number
  operationalState: QueueOperationalState
  statusLabel: string
  statusDetail: string
}

export interface DatabaseHealth {
  status: DatabaseOperationalState
  latencyMs: number | null
  statusLabel: string
  statusDetail: string
}

export interface HealthKpiSummary {
  configuredApis: number
  operationalApis: number
  degradedApis: number
  failingApis: number
  staleApis: number
  unconfiguredApis: number
  idleApis: number
  avgSuccessRate24h: number | null
}

/** Product version + deploy identity (full health snapshot only). */
export interface HealthAppIdentity {
  version: string
  commit: string | null
}

export interface HealthResponse {
  status: HealthOverallStatus
  statusLabel: string
  statusDetail: string
  healthScore: number
  /** SemVer from package.json + optional git short SHA from deploy env. */
  app: HealthAppIdentity
  database: DatabaseHealth
  apis: Record<string, ApiHealthStatus>
  syncQueue: SyncQueueHealth | null
  cronHealth: CronHealthSummary | null
  kpis: HealthKpiSummary
  alerts: HealthAlert[]
  checkedAt: string
}

export interface HealthLivenessResponse {
  status: 'ok' | 'offline'
  database: DatabaseHealth
  checkedAt: string
}

export interface HealthAlertDispatchResult {
  sent: boolean
  skipped: boolean
  skipReason: string | null
  fingerprint: string
  criticalCount: number
  channels: { email: boolean; webhook: boolean }
}