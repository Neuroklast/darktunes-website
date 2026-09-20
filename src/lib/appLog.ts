/**
 * src/lib/appLog.ts
 *
 * Single source of truth for writes to the app_logs table.
 * Server-only — never import from client components.
 *
 * Repeated logs with the same fingerprint are aggregated into one row with an
 * `occurrences` counter (via the `upsert_app_log` RPC). Details are redacted
 * before persistence. Never throws to the caller.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { redactLogContext } from '@/lib/observability/logger'
import { buildSimpleFingerprint } from '@/lib/observability/fingerprint'

export type AppLogLevel = 'error' | 'warn' | 'info'

export interface WriteAppLogOptions {
  source: string
  level?: AppLogLevel
  message: string
  details?: Record<string, unknown>
  userId?: string | null
  /** Pre-computed aggregation key; derived from source/level/message/route if omitted. */
  fingerprint?: string
  requestId?: string | null
  routePath?: string | null
  method?: string | null
}

const messageMaxLength = 4000

let _logClient: SupabaseClient<Database> | null = null
let _logClientKey = ''

function getLogClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const cacheKey = `${url}|${key}`
  if (_logClient && _logClientKey === cacheKey) return _logClient
  _logClient = createClient<Database>(url, key, { auth: { persistSession: false } })
  _logClientKey = cacheKey
  return _logClient
}

/** For test isolation only — resets the cached Supabase client. */
export function _resetLogClientForTests(): void {
  _logClient = null
  _logClientKey = ''
}

function environmentName(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'
}

function appVersion(): string {
  return (
    process.env.NEXT_PUBLIC_APP_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    'unknown'
  )
}

function clampMessage(message: string): string {
  return message.length > messageMaxLength
    ? `${message.slice(0, messageMaxLength)}…`
    : message
}

export async function writeAppLog(opts: WriteAppLogOptions): Promise<void> {
  try {
    const db = getLogClient()
    if (!db) return

    const source = opts.source
    const level: AppLogLevel = opts.level ?? 'error'
    const message = clampMessage(opts.message)
    const details = redactLogContext(opts.details ?? {})
    const userId = opts.userId ?? null
    const routePath = opts.routePath ?? null
    const method = opts.method ?? null
    const requestId = opts.requestId ?? null
    const fingerprint =
      opts.fingerprint ??
      buildSimpleFingerprint(source, level, message, routePath)

    let persisted = false
    try {
      if (typeof db.rpc === 'function') {
        const { error } = await db.rpc('upsert_app_log', {
          p_fingerprint: fingerprint,
          p_source: source,
          p_level: level,
          p_message: message,
          p_details: details,
          p_user_id: userId,
          p_environment: environmentName(),
          p_app_version: appVersion(),
          p_request_id: requestId,
          p_route_path: routePath,
          p_method: method,
        })
        persisted = !error
      }
    } catch {
      // RPC unavailable (pre-migration DB or test double) — fall back to insert
    }

    if (persisted) return

    const row: {
      source: string
      level: AppLogLevel
      message: string
      details: Record<string, unknown>
      user_id?: string
    } = {
      source,
      level,
      message,
      details,
    }

    if (userId) {
      row.user_id = userId
    }

    await db.from('app_logs').insert(row)
  } catch {
    // Never throw from the logger — silently ignore any DB failures
  }
}
