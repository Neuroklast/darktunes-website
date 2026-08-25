import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError, withErrorHandler, buildApiError } from './errors'
import { InvalidStatementTransitionError } from '@/lib/sos/statementStatusTransitions'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getErrorMessage } from './clientErrors'
import { ERROR_MESSAGES } from './errorCodes'
import type { Dictionary } from '@/i18n/types'

const { mockWriteAppLog } = vi.hoisted(() => ({
  mockWriteAppLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/appLog', () => ({
  writeAppLog: mockWriteAppLog,
}))

vi.mock('@/lib/routeUserContext', () => ({
  extractRouteUserContext: vi.fn().mockResolvedValue({ userId: 'user-123', userRole: 'portal' }),
}))

// Minimal mock dictionary with the errors namespace
const mockDict = {
  errors: {
    AUTH_REQUIRED: 'Please sign in to continue.',
    AUTH_TOKEN_INVALID: 'Your session has expired. Please sign in again.',
    AUTH_TOKEN_MISSING: 'Authentication token missing. Please sign in again.',
    FORBIDDEN: "You don't have permission to do that.",
    FORBIDDEN_ADMIN_ONLY: 'Admin access is required to perform this action.',
    FORBIDDEN_NO_ARTIST: 'Your account is not linked to an artist profile yet.',
    FORBIDDEN_JOURNALIST_ONLY: 'Journalist access is required to view this content.',
    NOT_FOUND: 'The requested item could not be found.',
    CONFLICT: 'A duplicate entry already exists.',
    UPLOAD_TOO_LARGE: 'The file is too large. Please choose a smaller file.',
    UPLOAD_WRONG_TYPE: 'This file type is not supported.',
    UPLOAD_NO_FILE: 'No file was attached to the request.',
    UPLOAD_PARSE_FAILED: 'The uploaded file could not be read. Please try again.',
    STORAGE_QUOTA_EXCEEDED: "Your label's storage quota is full. Please contact support.",
    VALIDATION_ERROR: 'Some fields contain invalid values. Please check the form.',
    RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
    EMAIL_SEND_FAILED: 'Your message could not be sent. Please try again later.',
    EMAIL_NOT_CONFIGURED: 'The email service is not configured on this server. Please contact the administrator.',
    EXTERNAL_API_ERROR: 'An external service is currently unavailable. Please try again later.',
    SERVER_ERROR: 'Something went wrong on our end. Please try again later.',
    CONFIG_ERROR: 'Something went wrong on our end. Please try again later.',
    DB_ERROR: 'Something went wrong on our end. Please try again later.',
  },
} as unknown as Dictionary

function makeRequest(method = 'GET'): NextRequest {
  return new NextRequest('http://localhost/api/test', { method })
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('ApiError', () => {
  it('sets name, message, and status', () => {
    const err = new ApiError(404, 'Not found')
    expect(err.name).toBe('ApiError')
    expect(err.message).toBe('Not found')
    expect(err.status).toBe(404)
  })

  it('sets optional code', () => {
    const err = new ApiError(400, 'Bad input', 'VALIDATION_ERROR')
    expect(err.code).toBe('VALIDATION_ERROR')
  })
})

describe('buildApiError', () => {
  it('creates an ApiError with the correct code and safe English message', () => {
    const err = buildApiError('UPLOAD_TOO_LARGE', 413)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(413)
    expect(err.code).toBe('UPLOAD_TOO_LARGE')
    expect(err.message).toBe(ERROR_MESSAGES.UPLOAD_TOO_LARGE)
    expect(err.message).not.toContain('413')
    expect(err.message).not.toContain('HTTP')
  })

  it('does not expose internal details in CONFIG_ERROR', () => {
    const err = buildApiError('CONFIG_ERROR', 500)
    expect(err.message).not.toContain('env')
    expect(err.message).not.toContain('configured')
    expect(err.code).toBe('CONFIG_ERROR')
  })

  it('does not expose internal details in DB_ERROR', () => {
    const err = buildApiError('DB_ERROR', 500)
    expect(err.message).not.toContain('SQL')
    expect(err.message).not.toContain('upsert')
    expect(err.code).toBe('DB_ERROR')
  })

  it('does not expose internal details in SERVER_ERROR', () => {
    const err = buildApiError('SERVER_ERROR', 500)
    expect(err.code).toBe('SERVER_ERROR')
    expect(err.status).toBe(500)
  })
})

describe('withErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('passes through a successful response unchanged', async () => {
    const handler = withErrorHandler(async () =>
      NextResponse.json({ ok: true }, { status: 200 }),
    )
    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('maps InvalidStatementTransitionError to 422', async () => {
    const handler = withErrorHandler(async () => {
      throw new InvalidStatementTransitionError('draft', 'paid')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('draft')
    expect(body.error).toContain('paid')
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('catches ApiError and returns the correct status + message', async () => {
    const handler = withErrorHandler(async () => {
      throw new ApiError(403, 'Forbidden')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden')
    expect(body.status).toBe(403)
    await flushAsyncWork()
    expect(mockWriteAppLog).not.toHaveBeenCalled()
  })

  it('logs RATE_LIMITED ApiError at warn level with user context', async () => {
    const handler = withErrorHandler(async () => {
      throw new ApiError(429, 'Rate limit exceeded', 'RATE_LIMITED')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('RATE_LIMITED')
    await flushAsyncWork()
    expect(mockWriteAppLog).toHaveBeenCalledWith(expect.objectContaining({
      source: 'api',
      level: 'warn',
      message: 'Rate limit exceeded',
      userId: 'user-123',
      details: expect.objectContaining({
        path: '/api/test',
        method: 'GET',
        code: 'RATE_LIMITED',
        status: 429,
        user_role: 'portal',
      }),
    }))
  })

  it('catches ZodError and returns 400 with VALIDATION_ERROR code', async () => {
    const handler = withErrorHandler(async () => {
      const schema = z.object({
        email: z.string().email({ message: 'Please enter a valid email address.' }),
      })
      schema.parse({ email: 'not-an-email' })
      return NextResponse.json({ ok: true })
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.error).toContain('valid email address')
    await flushAsyncWork()
    expect(mockWriteAppLog).toHaveBeenCalledWith(expect.objectContaining({
      source: 'api',
      level: 'warn',
      message: expect.stringContaining('Validation error:'),
      details: expect.objectContaining({
        path: '/api/test',
        method: 'GET',
        issues: expect.any(Array),
      }),
    }))
  })

  it('logs ApiError with status >= 500 to app_logs', async () => {
    const handler = withErrorHandler(async () => {
      throw new ApiError(500, 'Internal failure', 'SERVER_ERROR')
    })

    const res = await handler(makeRequest('POST'))
    expect(res.status).toBe(500)
    await flushAsyncWork()
    expect(mockWriteAppLog).toHaveBeenCalledWith(expect.objectContaining({
      source: 'api',
      level: 'error',
      message: 'Internal failure',
      details: expect.objectContaining({
        path: '/api/test',
        method: 'POST',
        code: 'SERVER_ERROR',
        status: 500,
      }),
    }))
  })

  it('catches unknown errors and returns 500 with SERVER_ERROR code (never raw message)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = withErrorHandler(async () => {
      throw new Error('DB connection string: postgres://secret@host/db')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.status).toBe(500)
    expect(body.code).toBe('SERVER_ERROR')
    // Must never expose the raw internal error message
    expect(body.error).not.toContain('DB connection string')
    expect(body.error).not.toContain('postgres://')
    consoleSpy.mockRestore()
  })
})

describe('getErrorMessage (client helper)', () => {
  it('returns translated message for known error code', () => {
    const body = { error: 'The file is too large.', code: 'UPLOAD_TOO_LARGE', status: 413 }
    const msg = getErrorMessage(body, (code) => mockDict.errors[code])
    expect(msg).toBe(mockDict.errors.UPLOAD_TOO_LARGE)
    expect(msg).not.toContain('413')
  })

  it('falls back to SERVER_ERROR for unknown code', () => {
    const body = { error: 'Some safe message', code: 'UNKNOWN_CODE_XYZ', status: 500 }
    const msg = getErrorMessage(body, (code) => mockDict.errors[code])
    expect(msg).toBe(mockDict.errors.SERVER_ERROR)
  })

  it('falls back to SERVER_ERROR when no code is present', () => {
    const body = { error: 'Something failed', status: 500 }
    const msg = getErrorMessage(body, (code) => mockDict.errors[code])
    expect(msg).toBe(mockDict.errors.SERVER_ERROR)
  })

  it('never returns raw HTTP status numbers', () => {
    const body = { error: 'HTTP 413', code: 'NONEXISTENT', status: 413 }
    const msg = getErrorMessage(body, (code) => mockDict.errors[code])
    expect(msg).not.toMatch(/\b413\b/)
    expect(msg).not.toContain('HTTP')
  })

  it('handles RATE_LIMITED correctly', () => {
    const body = { error: 'Too many requests.', code: 'RATE_LIMITED', status: 429 }
    const msg = getErrorMessage(body, (code) => mockDict.errors[code])
    expect(msg).toBe(mockDict.errors.RATE_LIMITED)
  })
})