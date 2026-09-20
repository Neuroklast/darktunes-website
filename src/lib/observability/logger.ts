/**
 * src/lib/observability/logger.ts
 *
 * Structured JSON logging (console only, Node + Edge) with PII redaction.
 * No external tracker, no mandatory vendor — the app runs unconfigured.
 *
 * Not an audit log: business changes belong in `src/lib/adminAuditLog.ts`.
 * Server and client safe (console only); persistence happens in `captureError`.
 */

export type LogLevel = 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>

const redactedValue = '[redacted]'

const sensitiveKeyPattern =
  /(password|passwort|secret|token|authorization|cookie|api[-_]?key|e-?mail|phone|telefon|iban|bic|adresse|address|street|stra(?:ß|ss)e|wbk|efp|seriennummer|serial|waffe|weapon|geburt|birth)/i

const maxDepth = 4
const maxEntries = 50

/** Strips PII/token patterns from free text (error messages, stacks). */
export function scrubLogText(value: string): string {
  return value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, redactedValue)
    .replace(/\bBearer\s+\S+/gi, `Bearer ${redactedValue}`)
    .replace(/\b\d{6,}\b/g, redactedValue)
}

export function redactLogContext(context: LogContext, depth = 0): LogContext {
  const result: LogContext = {}
  for (const [key, value] of Object.entries(context).slice(0, maxEntries)) {
    if (value === undefined) {
      continue
    }
    if (sensitiveKeyPattern.test(key)) {
      result[key] = redactedValue
      continue
    }
    if (depth >= maxDepth) {
      result[key] = '[truncated]'
      continue
    }
    result[key] = redactValue(value, depth + 1)
  }
  return result
}

function redactValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return value.slice(0, maxEntries).map((entry) => redactValue(entry, depth + 1))
  }
  if (typeof value === 'object') {
    return redactLogContext(value as LogContext, depth)
  }
  return String(value)
}

export function describeError(error: unknown): LogContext {
  if (error instanceof Error) {
    const digest = (error as { digest?: unknown }).digest
    return {
      name: error.name,
      message: scrubLogText(error.message),
      digest: digest === undefined ? undefined : String(digest),
      stack: error.stack
        ? scrubLogText(error.stack.split('\n').slice(0, 6).join('\n'))
        : undefined,
    }
  }
  return { message: scrubLogText(String(error)) }
}

export function logEvent(
  level: LogLevel,
  event: string,
  context: LogContext = {},
): void {
  const line = JSON.stringify({
    ...redactLogContext(context),
    level,
    time: new Date().toISOString(),
    event,
  })
  if (level === 'error') {
    console.error(line)
    return
  }
  if (level === 'warn') {
    console.warn(line)
    return
  }
  console.log(line)
}

export function logInfo(event: string, context: LogContext = {}): void {
  logEvent('info', event, context)
}

export function logWarn(event: string, context: LogContext = {}): void {
  logEvent('warn', event, context)
}

export function logError(
  event: string,
  error: unknown,
  context: LogContext = {},
): void {
  logEvent('error', event, { ...context, error: describeError(error) })
}
