/**
 * src/lib/health/heartbeats.ts
 *
 * Persists cron heartbeat timestamps in site_settings (KV).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type HealthHeartbeatKey =
  | 'sync_execute'
  | 'sync_queue'
  | 'sync_youtube'
  | 'health_alert'

export type HealthHeartbeats = Record<HealthHeartbeatKey, string | null>

const HEARTBEATS_SETTINGS_KEY = 'health_heartbeats'

const EMPTY_HEARTBEATS: HealthHeartbeats = {
  sync_execute: null,
  sync_queue: null,
  sync_youtube: null,
  health_alert: null,
}

function parseHeartbeats(raw: string | null | undefined): HealthHeartbeats {
  if (!raw) return { ...EMPTY_HEARTBEATS }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<HealthHeartbeatKey, unknown>>
    return {
      sync_execute: typeof parsed.sync_execute === 'string' ? parsed.sync_execute : null,
      sync_queue: typeof parsed.sync_queue === 'string' ? parsed.sync_queue : null,
      sync_youtube: typeof parsed.sync_youtube === 'string' ? parsed.sync_youtube : null,
      health_alert: typeof parsed.health_alert === 'string' ? parsed.health_alert : null,
    }
  } catch {
    return { ...EMPTY_HEARTBEATS }
  }
}

export async function getHealthHeartbeats(
  db: SupabaseClient<Database>,
): Promise<HealthHeartbeats> {
  const { data, error } = await db
    .from('site_settings')
    .select('value')
    .eq('key', HEARTBEATS_SETTINGS_KEY)
    .maybeSingle()

  if (error) throw new Error(`Failed to read health heartbeats: ${error.message}`)
  return parseHeartbeats(data?.value)
}

export async function recordHealthHeartbeat(
  db: SupabaseClient<Database>,
  key: HealthHeartbeatKey,
  at: string = new Date().toISOString(),
): Promise<void> {
  // Read-modify-write with one retry so concurrent cron keys do not wipe each other.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const existing = await getHealthHeartbeats(db)
      const updated: HealthHeartbeats = { ...existing, [key]: at }
      const { error } = await db.from('site_settings').upsert(
        { key: HEARTBEATS_SETTINGS_KEY, value: JSON.stringify(updated) },
        { onConflict: 'key' },
      )
      if (error) {
        console.error(`[recordHealthHeartbeat] upsert failed for ${key}:`, error.message)
        return
      }
      return
    } catch (err) {
      if (attempt === 1) {
        console.error(`[recordHealthHeartbeat] failed for ${key}:`, err)
      }
    }
  }
}
