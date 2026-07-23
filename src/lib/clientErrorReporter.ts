'use client'

/**
 * src/lib/clientErrorReporter.ts
 *
 * Reports client-side errors to:
 *   1. Sentry (when NEXT_PUBLIC_SENTRY_DSN is set)
 *   2. POST /api/log-error (authenticated users only)
 */

import { reportExceptionFireAndForget } from '@/lib/observability/reportException'

const DEBOUNCE_MS = 2_000
const reportedFingerprints = new Set<string>()

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const pendingReports: Array<{
  source: string
  message: string
  level: 'error' | 'warn' | 'info'
  details: Record<string, unknown>
}> = []

function fingerprint(source: string, message: string): string {
  return `${source}:${message.slice(0, 200)}`
}

async function flushPendingReports(): Promise<void> {
  const batch = pendingReports.splice(0, pendingReports.length)
  for (const report of batch) {
    try {
      await fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
        credentials: 'include',
      })
    } catch {
      // Non-blocking — client logging is best-effort
    }
  }
}

export function reportClientError(
  source: string,
  error: unknown,
  details?: Record<string, unknown>,
  level: 'error' | 'warn' | 'info' = 'error',
): void {
  const message = error instanceof Error ? error.message : String(error)
  const fp = fingerprint(source, message)
  if (reportedFingerprints.has(fp)) return
  reportedFingerprints.add(fp)

  const path = typeof window !== 'undefined' ? window.location.pathname : null
  const enrichedDetails: Record<string, unknown> = {
    ...details,
    stack: error instanceof Error ? (error.stack ?? null) : null,
    path,
  }

  if (level === 'error') {
    reportExceptionFireAndForget(error, {
      source,
      path: path ?? undefined,
      extra: details,
    })
  }

  pendingReports.push({
    source,
    message,
    level,
    details: enrichedDetails,
  })

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void flushPendingReports()
  }, DEBOUNCE_MS)
}
