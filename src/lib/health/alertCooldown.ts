/**
 * src/lib/health/alertCooldown.ts
 *
 * Persists alert dispatch cooldown state in site_settings.
 * Platform-wide (Org #0) — not per label tenant.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

const ALERT_STATE_KEY = 'health_alert_state'

export interface HealthAlertDispatchState {
  lastSentAt: string | null
  fingerprint: string | null
}

function parseState(raw: string | null | undefined): HealthAlertDispatchState {
  if (!raw) return { lastSentAt: null, fingerprint: null }
  try {
    const parsed = JSON.parse(raw) as Partial<HealthAlertDispatchState>
    return {
      lastSentAt: typeof parsed.lastSentAt === 'string' ? parsed.lastSentAt : null,
      fingerprint: typeof parsed.fingerprint === 'string' ? parsed.fingerprint : null,
    }
  } catch {
    return { lastSentAt: null, fingerprint: null }
  }
}

export async function getHealthAlertDispatchState(
  db: SupabaseClient<Database>,
): Promise<HealthAlertDispatchState> {
  const { data, error } = await db
    .from('site_settings')
    .select('value')
    .eq('organization_id', DEFAULT_ORGANIZATION_ID)
    .eq('key', ALERT_STATE_KEY)
    .maybeSingle()

  if (error) throw new Error(`Failed to read health alert state: ${error.message}`)
  return parseState(data?.value)
}

export function shouldDispatchCriticalAlerts(
  state: HealthAlertDispatchState,
  fingerprint: string,
  cooldownMs: number,
  nowMs: number = Date.now(),
): { dispatch: boolean; reason: string | null } {
  if (!fingerprint) {
    return { dispatch: false, reason: 'no_critical_alerts' }
  }

  if (state.fingerprint !== fingerprint) {
    return { dispatch: true, reason: null }
  }

  if (!state.lastSentAt) {
    return { dispatch: true, reason: null }
  }

  const elapsed = nowMs - new Date(state.lastSentAt).getTime()
  if (elapsed >= cooldownMs) {
    return { dispatch: true, reason: 'cooldown_elapsed' }
  }

  return {
    dispatch: false,
    reason: `cooldown_active_${Math.ceil((cooldownMs - elapsed) / 60_000)}m`,
  }
}

export async function markHealthAlertsDispatched(
  db: SupabaseClient<Database>,
  fingerprint: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  const payload: HealthAlertDispatchState = { lastSentAt: at, fingerprint }
  const { error } = await db.from('site_settings').upsert(
    {
      organization_id: DEFAULT_ORGANIZATION_ID,
      key: ALERT_STATE_KEY,
      value: JSON.stringify(payload),
    },
    { onConflict: 'organization_id,key' },
  )
  if (error) throw new Error(`Failed to persist health alert state: ${error.message}`)
}
