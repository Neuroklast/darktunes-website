/**
 * src/lib/health/healthLiveness.ts
 *
 * Lightweight database liveness probe for HEAD / lite health checks.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  DB_LATENCY_CRITICAL_MS,
  DB_LATENCY_WARN_MS,
} from './thresholds'
import type { DatabaseHealth, HealthLivenessResponse } from './types'

export function deriveDatabaseHealth(
  online: boolean,
  latencyMs: number | null,
): DatabaseHealth {
  if (!online) {
    return {
      status: 'offline',
      latencyMs,
      statusLabel: 'Unreachable',
      statusDetail: 'Database ping failed — public reads and sync jobs cannot run.',
    }
  }

  if (latencyMs !== null && latencyMs >= DB_LATENCY_CRITICAL_MS) {
    return {
      status: 'critical',
      latencyMs,
      statusLabel: 'Critical latency',
      statusDetail: `Round-trip ${latencyMs}ms exceeds ${DB_LATENCY_CRITICAL_MS}ms threshold.`,
    }
  }

  if (latencyMs !== null && latencyMs >= DB_LATENCY_WARN_MS) {
    return {
      status: 'slow',
      latencyMs,
      statusLabel: 'Elevated latency',
      statusDetail: `Round-trip ${latencyMs}ms exceeds ${DB_LATENCY_WARN_MS}ms warning threshold.`,
    }
  }

  return {
    status: 'online',
    latencyMs,
    statusLabel: 'Connected',
    statusDetail:
      latencyMs !== null
        ? `Healthy connection · ${latencyMs}ms round-trip`
        : 'Healthy connection',
  }
}

export async function checkDatabaseLiveness(
  db: SupabaseClient<Database> | null,
): Promise<DatabaseHealth> {
  if (!db) {
    return deriveDatabaseHealth(false, null)
  }

  try {
    const start = Date.now()
    const { error } = await db.from('sync_logs').select('id').limit(1)
    const latencyMs = Date.now() - start
    return deriveDatabaseHealth(!error, latencyMs)
  } catch {
    return deriveDatabaseHealth(false, null)
  }
}

export async function buildHealthLivenessResponse(
  db: SupabaseClient<Database> | null,
): Promise<HealthLivenessResponse> {
  const database = await checkDatabaseLiveness(db)
  return {
    status: database.status === 'offline' ? 'offline' : 'ok',
    database,
    checkedAt: new Date().toISOString(),
  }
}