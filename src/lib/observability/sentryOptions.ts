/**
 * Shared Sentry init options (server / edge / browser).
 * No-op when DSN is unset — safe for local dev and CI without secrets.
 */

type SentryLikeEvent = {
  request?: {
    headers?: Record<string, string>
  }
}

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-supabase-auth',
  'x-cron-secret',
])

export function scrubSentryEvent<T extends SentryLikeEvent>(event: T): T {
  const headers = event.request?.headers
  if (!headers) return event
  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
      delete headers[key]
    }
  }
  return event
}

export function getSentryEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    'development'
  )
}

export function sentryEnabled(dsn: string | undefined | null): boolean {
  return Boolean(dsn?.trim())
}

/** Sample rates: keep prod errors full; traces low by default. */
export function getTracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim()
  if (raw === undefined || raw === '') {
    return process.env.NODE_ENV === 'production' ? 0.1 : 0
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(1, n)
}
