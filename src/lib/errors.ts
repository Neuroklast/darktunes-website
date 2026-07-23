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
import { extractRouteUserContext } from '@/lib/routeUserContext'
import { reportExceptionFireAndForget } from '@/lib/observability/reportException'
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from '@/lib/observability/requestId'
import { type ErrorCode, ERROR_MESSAGES } from './errorCodes'
import { SettlementPeriodNotWritableError } from '@/lib/api/settlementPeriods'

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

export interface ApiErrorResponse {
  error: string
  code?: string
  status: number
  /** Correlation id — present on errors so clients/support can match logs. */
  requestId?: string
}

function buildErrorResponse(
  message: string,
  status: number,
  code: string | undefined,
  requestId: string,
): NextResponse<ApiErrorResponse> {
  const res = NextResponse.json(
    { error: message, code, status, requestId },
    { status },
  )
  res.headers.set(REQUEST_ID_HEADER, requestId)
  return res
}

function attachRequestId(res: NextResponse, requestId: string): NextResponse {
  res.headers.set(REQUEST_ID_HEADER, requestId)
  return res
}

function structuredLog(
  level: 'error' | 'warn' | 'info',
  message: string,
  fields: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...fields,
  })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
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
    await writeAppLog({
      source: 'api',
      level,
      message,
      details: {
        ...details,
        ...(ctx.userRole ? { user_role: ctx.userRole } : {}),
      },
      userId: ctx.userId,
    })
  })()
}

// ---------------------------------------------------------------------------
// withErrorHandler — Higher-Order Function for Route Handlers
// ---------------------------------------------------------------------------

type RouteHandler = (req: NextRequest) => Promise<NextResponse>

/**
 * Wraps a Next.js Route Handler with centralised error handling.
 *
 * Handles:
 *   - `ApiError`   → returns the error's status code and message as JSON
 *   - `ZodError`   → returns 400 with a human-readable validation message
 *   - Unknown errors → returns 500 Internal Server Error (sanitised message)
 *                      and persists the error to the `app_logs` DB table
 *
 * Always echoes `x-request-id` and includes `requestId` on error JSON bodies.
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req) => {
    const requestId = resolveRequestId(req.headers)
    const routePath = (() => {
      try {
        return new URL(req.url).pathname
      } catch {
        return req.url
      }
    })()

    try {
      const res = await handler(req)
      return attachRequestId(res, requestId)
    } catch (err) {
      if (err instanceof SettlementPeriodNotWritableError) {
        return buildErrorResponse(err.message, 409, undefined, requestId)
      }

      if (err instanceof ApiError) {
        const logLevel = resolveApiErrorLogLevel(err)
        if (logLevel) {
          structuredLog(logLevel, err.message, {
            requestId,
            path: routePath,
            method: req.method,
            code: err.code ?? null,
            status: err.status,
          })
          persistRouteError(
            req,
            err.message,
            {
              path: routePath,
              method: req.method,
              code: err.code ?? null,
              status: err.status,
              request_id: requestId,
            },
            logLevel,
          )
        }
        if (err.status >= 500) {
          reportExceptionFireAndForget(err, {
            requestId,
            path: routePath,
            method: req.method,
            code: err.code ?? null,
            source: 'api',
          })
        }
        return buildErrorResponse(err.message, err.status, err.code, requestId)
      }

      if (err instanceof ZodError) {
        const message = err.issues.map((e) => e.message).join('; ')
        structuredLog('warn', 'Validation error', {
          requestId,
          path: routePath,
          method: req.method,
        })
        persistRouteError(
          req,
          `Validation error: ${message}`,
          {
            path: routePath,
            method: req.method,
            issues: err.issues,
            request_id: requestId,
          },
          'warn',
        )
        return buildErrorResponse(message, 400, 'VALIDATION_ERROR', requestId)
      }

      if (isPostgresError(err)) {
        const message = getPostgresErrorMessage(err)
        structuredLog('error', 'Database error', {
          requestId,
          path: routePath,
          method: req.method,
          code: err.code ?? null,
        })
        persistRouteError(
          req,
          message,
          {
            path: routePath,
            method: req.method,
            code: err.code ?? null,
            details: err.details ?? null,
            hint: err.hint ?? null,
            request_id: requestId,
          },
          'error',
        )
        reportExceptionFireAndForget(err, {
          requestId,
          path: routePath,
          method: req.method,
          code: err.code ?? null,
          source: 'api.db',
        })
        return buildErrorResponse(ERROR_MESSAGES.SERVER_ERROR, 500, 'SERVER_ERROR', requestId)
      }

      // Unknown error — structured log, app_logs, Sentry
      const errMessage = err instanceof Error ? err.message : String(err)
      structuredLog('error', 'Unhandled route error', {
        requestId,
        path: routePath,
        method: req.method,
        error: errMessage,
      })
      persistRouteError(
        req,
        errMessage,
        {
          path: routePath,
          method: req.method,
          stack: err instanceof Error ? (err.stack ?? null) : null,
          request_id: requestId,
        },
        'error',
      )
      reportExceptionFireAndForget(err, {
        requestId,
        path: routePath,
        method: req.method,
        source: 'api',
      })
      // Never expose internal error details — always return a safe generic message
      return buildErrorResponse(ERROR_MESSAGES.SERVER_ERROR, 500, 'SERVER_ERROR', requestId)
    }
  }
}
