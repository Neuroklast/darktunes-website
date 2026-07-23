/**
 * Best-effort exception reporting to Sentry (no-op when DSN unset / import fails).
 */

import { scrubSentryEvent } from '@/lib/observability/sentryOptions'

export type ReportExceptionContext = {
  requestId?: string
  path?: string
  method?: string
  code?: string | null
  source?: string
  extra?: Record<string, unknown>
}

export async function reportException(
  error: unknown,
  context: ReportExceptionContext = {},
): Promise<void> {
  try {
    const Sentry = await import('@sentry/nextjs')
    const dsn =
      typeof window === 'undefined'
        ? process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
        : process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
    if (!dsn) return

    Sentry.withScope((scope) => {
      if (context.requestId) scope.setTag('request_id', context.requestId)
      if (context.path) scope.setTag('path', context.path)
      if (context.method) scope.setTag('method', context.method)
      if (context.code) scope.setTag('error_code', context.code)
      if (context.source) scope.setTag('source', context.source)
      if (context.extra) {
        for (const [key, value] of Object.entries(context.extra)) {
          scope.setExtra(key, value)
        }
      }
      scope.addEventProcessor((event) => scrubSentryEvent(event))
      Sentry.captureException(error)
    })
  } catch {
    // Observability must never break the request path
  }
}

/** Fire-and-forget wrapper for route handlers. */
export function reportExceptionFireAndForget(
  error: unknown,
  context?: ReportExceptionContext,
): void {
  void reportException(error, context)
}
