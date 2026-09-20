/**
 * src/lib/observability/captureError.ts
 *
 * Central entry point for unexpected errors (unhandled server errors via
 * `instrumentation.ts`, server actions, background jobs). Writes a structured
 * JSON console line and best-effort persists an aggregated row to `app_logs`.
 *
 * Rules:
 * - Only scrubbed data reaches the log (see `logger.ts`).
 * - Never throws, never recurses (persistence failures only hit `console`).
 * - Persistence is Node-only; Edge falls back to the console line.
 *
 * Not an audit log: business changes belong in `src/lib/adminAuditLog.ts`.
 */

import { logEvent, scrubLogText, redactLogContext } from '@/lib/observability/logger'
import { buildLogFingerprint } from '@/lib/observability/fingerprint'
import { writeAppLog } from '@/lib/appLog'

export type CaptureErrorLevel = 'error' | 'warn'

export type CaptureErrorContext = {
  level?: CaptureErrorLevel
  source?: string
  requestId?: string | null
  path?: string | null
  method?: string | null
  routePath?: string | null
  routeType?: string | null
  routerKind?: string | null
  userId?: string | null
  context?: Record<string, unknown>
}

type NormalizedError = {
  errorName: string
  message: string
  stack: string | null
  digest: string | null
}

const errorNameFallback = 'Error'
const stackMaxLength = 8000

/** Re-entrancy guard: a logging failure must never produce another log. */
let persisting = false

export function isErrorLogEnabled(): boolean {
  if (process.env.APP_ERROR_LOG_DISABLED === 'true') return false
  if (process.env.VITEST === 'true' && process.env.APP_ERROR_LOG_TEST_PERSIST !== 'true') {
    return false
  }
  return true
}

/** Persistence needs the Node runtime (service-role Supabase client). */
function isNodeRuntime(): boolean {
  const runtime = process.env.NEXT_RUNTIME
  return runtime === undefined || runtime === 'nodejs'
}

function clamp(value: string | null, max: number): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

/** Accepts `Error`, Next digest errors and plain client objects. */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const digest = (error as { digest?: unknown }).digest
    return {
      errorName: error.name || errorNameFallback,
      message: scrubLogText(error.message || error.name || 'Unknown error'),
      stack: error.stack ? scrubLogText(error.stack) : null,
      digest: digest === undefined || digest === null ? null : String(digest),
    }
  }
  if (typeof error === 'string') {
    return { errorName: errorNameFallback, message: scrubLogText(error), stack: null, digest: null }
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message =
      typeof record.message === 'string' && record.message
        ? record.message
        : JSON.stringify(redactLogContext(record))
    return {
      errorName: typeof record.name === 'string' && record.name ? record.name : errorNameFallback,
      message: scrubLogText(message),
      stack: typeof record.stack === 'string' ? scrubLogText(record.stack) : null,
      digest:
        record.digest === undefined || record.digest === null ? null : String(record.digest),
    }
  }
  return { errorName: errorNameFallback, message: 'Unknown error', stack: null, digest: null }
}

/**
 * Writes the structured console line and persists the aggregated error row.
 * Never throws.
 */
export async function captureError(
  event: string,
  error: unknown,
  context: CaptureErrorContext = {},
): Promise<void> {
  const level: CaptureErrorLevel = context.level ?? 'error'
  const detail = normalizeError(error)

  logEvent(level, event, {
    ...(context.context ?? {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.path ? { path: context.path } : {}),
    ...(context.method ? { method: context.method } : {}),
    ...(context.routePath ? { routePath: context.routePath } : {}),
    error: {
      name: detail.errorName,
      message: detail.message,
      ...(detail.stack ? { stack: detail.stack.split('\n').slice(0, 6).join('\n') } : {}),
      ...(detail.digest ? { digest: detail.digest } : {}),
    },
  })

  if (!isErrorLogEnabled() || !isNodeRuntime() || persisting) {
    return
  }
  persisting = true
  try {
    const fingerprint = buildLogFingerprint({
      event,
      errorName: detail.errorName,
      message: detail.message,
      stack: detail.stack,
    })

    await writeAppLog({
      source: context.source ?? 'server',
      level,
      message: `${detail.errorName}: ${detail.message}`,
      details: {
        event,
        error_name: detail.errorName,
        digest: detail.digest,
        stack: clamp(detail.stack, stackMaxLength),
        ...(context.context ?? {}),
      },
      userId: context.userId ?? null,
      fingerprint,
      requestId: context.requestId ?? null,
      routePath: context.routePath ?? context.path ?? null,
      method: context.method ?? null,
    })
  } catch (persistError) {
    console.error('error log persist failed', persistError)
  } finally {
    persisting = false
  }
}
