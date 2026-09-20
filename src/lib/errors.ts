/**
 * src/lib/errors.ts
 *
 * Centralized error handling for Next.js Route Handlers.
 *
 * Usage:
 *   export const GET = withErrorHandler(async (req) => {
 *     // ... handler logic
 *     return NextResponse.json({ data })
 *   })
 *
 * Any unhandled error is caught, logged, and returned as a standardised
 * JSON error response with the correct HTTP status code.
 *
 * Prefer `buildApiError` over `new ApiError` when the error maps to a
 * well-known code in errorCodes.ts — this guarantees that the safe English
 * fallback message never diverges from the dictionary.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { writeAppLog } from '@/lib/appLog'
import { auditAdminMutation } from '@/lib/adminAuditLog'
import { extractRouteUserContext } from '@/lib/routeUserContext'
import { type ErrorCode, ERROR_MESSAGES } from './errorCodes'
import { SettlementPeriodNotWritableError } from '@/lib/api/settlementPeriods'
import { InvalidStatementTransitionError } from '@/lib/sos/statementStatusTransitions'

// ---------------------------------------------------------------------------
// ApiError — structured error thrown inside route handlers
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Domain precondition violation (wrong status, locked period, overpayment,
 * concurrent update, immutable document). Maps to 409/422 instead of 500 —
 * see `docs/agent/sos-accounting-contract.md` §A.7.
 */
export class BusinessRuleError extends Error {
  constructor(
    message: string,
    public readonly status: number = 409,
    public readonly code: string = 'BUSINESS_RULE_VIOLATION',
  ) {
    super(message)
    this.name = 'BusinessRuleError'
  }
}

/**
 * Factory that creates an ApiError from a typed ErrorCode.
 * The human-readable message is drawn from ERROR_MESSAGES so it is always
 * safe (no internal details) and consistent with the i18n dictionary.
 *
 * @example
 *   throw buildApiError('UPLOAD_TOO_LARGE', 413)
 *   throw buildApiError('CONFIG_ERROR', 500)
 */
export function buildApiError(code: ErrorCode, status: number): ApiError {
  return new ApiError(status, ERROR_MESSAGES[code], code)
}

interface PostgresErrorLike {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

export function isPostgresError(err: unknown, code?: string): err is PostgresErrorLike {
  if (!err || typeof err !== 'object') return false
  const pgCode = (err as PostgresErrorLike).code
  if (typeof pgCode !== 'string') return false
  return code ? pgCode === code : true
}

export function getPostgresErrorMessage(err: PostgresErrorLike): string {
  return err.message ?? 'Database operation failed'
}

// ---------------------------------------------------------------------------
// Standard JSON error shape
// ---------------------------------------------------------------------------

/** Minimal legacy error-body shape kept for clients that read `error`/`code`. */
export interface ApiErrorBody {
  error: string
  code?: string
  status?: number
}

export interface ApiErrorResponse extends ApiErrorBody {
  /** RFC 9457 problem type URI (`about:blank` when no registry entry exists). */
  type: string
  /** Short human-readable summary. */
  title: string
  status: number
  /** Human-readable explanation (the safe message). */
  detail: string
}

function buildErrorResponse(
  message: string,
  status: number,
  code?: string,
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = {
    type: 'about:blank',
    title: code ?? (status >= 500 ? 'Server error' : 'Request failed'),
    status,
    detail: message,
    error: message,
    ...(code ? { code } : {}),
  }
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })
}

// ---------------------------------------------------------------------------
// API error logging policy
// ---------------------------------------------------------------------------

/** 4xx codes worth persisting at warn level (user-impacting, not routine auth noise). */
const WARN_LOG_API_ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  'RATE_LIMITED',
  'UPLOAD_TOO_LARGE',
  'UPLOAD_WRONG_TYPE',
  'UPLOAD_NO_FILE',
  'UPLOAD_PARSE_FAILED',
  'STORAGE_QUOTA_EXCEEDED',
  'EXTERNAL_API_ERROR',
  'EMAIL_SEND_FAILED',
  'AUTH_TOKEN_INVALID',
])

function resolveApiErrorLogLevel(err: ApiError): 'error' | 'warn' | null {
  if (err.status >= 500) return 'error'
  if (err.code && WARN_LOG_API_ERROR_CODES.has(err.code as ErrorCode)) return 'warn'
  return null
}

type AppLogLevel = 'error' | 'warn' | 'info'

function persistRouteError(
  req: NextRequest,
  message: string,
  details: Record<string, unknown>,
  level: AppLogLevel,
): void {
  void (async () => {
    const ctx = await extractRouteUserContext(req)
    const routePath = (() => {
      try { return new URL(req.url).pathname } catch { return req.url }
    })()
    await writeAppLog({
      source: 'api',
      level,
      message,
      details: {
        ...details,
        ...(ctx.userRole ? { user_role: ctx.userRole } : {}),
      },
      userId: ctx.userId,
      routePath,
      method: req.method,
    })
  })()
}

// ---------------------------------------------------------------------------
// withErrorHandler — Higher-Order Function for Route Handlers
// ---------------------------------------------------------------------------

type RouteHandler = (req: NextRequest) => Promise<NextResponse>

/**
 * Maps a thrown route error to the shared problem+json response. Exposed so
 * dynamic route handlers (which need the Next.js context argument) can reuse
 * the exact same mapping without wrapping through `withErrorHandler`.
 */
export function handleRouteError(req: NextRequest, err: unknown): NextResponse {
  const routePath = (() => {
    try { return new URL(req.url).pathname } catch { return req.url }
  })()

  if (err instanceof SettlementPeriodNotWritableError) {
    return buildErrorResponse(err.message, 409)
  }

  if (err instanceof InvalidStatementTransitionError) {
    return buildErrorResponse(err.message, 422, 'VALIDATION_ERROR')
  }

  if (err instanceof BusinessRuleError) {
    return buildErrorResponse(err.message, err.status, err.code)
  }

  if (err instanceof ApiError) {
    const logLevel = resolveApiErrorLogLevel(err)
    if (logLevel) {
      persistRouteError(req, err.message, {
        path: routePath,
        method: req.method,
        code: err.code ?? null,
        status: err.status,
      }, logLevel)
    }
    return buildErrorResponse(err.message, err.status, err.code)
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((e) => e.message).join('; ')
    persistRouteError(req, `Validation error: ${message}`, {
      path: routePath,
      method: req.method,
      issues: err.issues,
    }, 'warn')
    return buildErrorResponse(message, 400, 'VALIDATION_ERROR')
  }

  if (isPostgresError(err)) {
    const message = getPostgresErrorMessage(err)
    console.error('[withErrorHandler] Database error:', {
      code: err.code,
      message,
      details: err.details ?? null,
      path: routePath,
    })
    persistRouteError(req, message, {
      path: routePath,
      method: req.method,
      code: err.code ?? null,
      details: err.details ?? null,
      hint: err.hint ?? null,
    }, 'error')
    return buildErrorResponse(ERROR_MESSAGES.SERVER_ERROR, 500, 'SERVER_ERROR')
  }

  // Unknown error — log server-side and persist to app_logs
  console.error('[withErrorHandler] Unhandled route error:', err)
  const errMessage = err instanceof Error ? err.message : String(err)
  persistRouteError(req, errMessage, {
    path: routePath,
    method: req.method,
    stack: err instanceof Error ? (err.stack ?? null) : null,
  }, 'error')
  // Never expose internal error details — always return a safe generic message
  return buildErrorResponse(ERROR_MESSAGES.SERVER_ERROR, 500, 'SERVER_ERROR')
}

/**
 * Wraps a Next.js Route Handler with centralised error handling.
 *
 * Handles:
 *   - `ApiError`   → returns the error's status code and message as JSON
 *   - `ZodError`   → returns 400 with a human-readable validation message
 *   - Unknown errors → returns 500 Internal Server Error (sanitised message)
 *                      and persists the error to the `app_logs` DB table
 *
 * Also records an automatic `admin_audit_log` entry for admin mutations (the
 * actor is set by `adminAuth.verifyAdminRequest`).
 *
 * Dynamic routes that need Next.js' context argument use `handleRouteError`.
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req) => {
    try {
      const response = await handler(req)
      // Awaited so the audit row is guaranteed to land (admin mutations are rare).
      await auditAdminMutation(req, response.status)
      return response
    } catch (err) {
      const response = handleRouteError(req, err)
      await auditAdminMutation(req, response.status)
      return response
    }
  }
}
