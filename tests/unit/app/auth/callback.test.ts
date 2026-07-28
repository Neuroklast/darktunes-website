/**
 * Regression tests for invite-verification diagnostics in app/auth/callback/route.ts.
 *
 * Covers:
 *  - verifyOtp failure: safe console.error log (no token_hash / PII), correct redirect
 *  - verifyOtp failure with portal=1: portal flag surfaced in log
 *  - verifyOtp success: no error logged, redirect to destination
 *  - missing token_hash: redirect to missing_code URL
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── Supabase SSR mock ────────────────────────────────────────────────────────
const mockVerifyOtp = vi.fn()
const mockSignOut = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      signOut: mockSignOut,
      verifyOtp: mockVerifyOtp,
    },
  }),
}))

// ── Supabase server mock (used by the non-invite code path) ──────────────────
const mockExchangeCodeForSession = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }),
    }),
  }),
}))

// ── resolveRedirectPath mock (used by the non-invite code path) ──────────────
vi.mock('@/lib/auth/resolveRedirectPath', () => ({
  resolveRedirectPath: vi.fn().mockReturnValue('/admin'),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInviteRequest(overrides: {
  tokenHash?: string | null
  portal?: boolean
  type?: string
}): NextRequest {
  const url = new URL('http://localhost/auth/callback')
  url.searchParams.set('invite', '1')
  if (overrides.tokenHash !== null) {
    url.searchParams.set('token_hash', overrides.tokenHash ?? 'test-hash-value')
  }
  if (overrides.type) {
    url.searchParams.set('type', overrides.type)
  }
  if (overrides.portal) {
    url.searchParams.set('portal', '1')
  }
  return new NextRequest(url)
}

async function loadRoute() {
  vi.resetModules()
  return import('../../../../app/auth/callback/route')
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /auth/callback — invite verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  describe('verifyOtp failure', () => {
    const supabaseError = {
      message: 'OTP has expired or is invalid',
      status: 422,
      code: 'otp_expired',
    }

    beforeEach(() => {
      mockVerifyOtp.mockResolvedValue({ error: supabaseError })
    })

    it('redirects to invite login with error=auth_failed', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: 'secret-token-hash' })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/login')
      expect(location).toContain('type=invite')
      expect(location).toContain('error=auth_failed')

      consoleSpy.mockRestore()
    })

    it('logs a safe console.error with Supabase error details', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: 'secret-token-hash' })
      await GET(request)

      expect(consoleSpy).toHaveBeenCalledOnce()
      const [label, payload] = consoleSpy.mock.calls[0] as [string, Record<string, unknown>]
      expect(label).toBe('[auth/callback] invite token verification failed')
      expect(payload.message).toBe(supabaseError.message)
      expect(payload.status).toBe(supabaseError.status)
      expect(payload.code).toBe(supabaseError.code)
      expect(payload.portal).toBe(false)
      expect(payload.host).toBe('localhost')

      consoleSpy.mockRestore()
    })

    it('does not include the token_hash value in the log payload', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: 'secret-token-hash' })
      await GET(request)

      const logArgs = JSON.stringify(consoleSpy.mock.calls)
      expect(logArgs).not.toContain('secret-token-hash')

      consoleSpy.mockRestore()
    })

    it('surfaces portal=true in the log when portal=1 was requested', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: 'secret-token-hash', portal: true })
      await GET(request)

      const [, payload] = consoleSpy.mock.calls[0] as [string, Record<string, unknown>]
      expect(payload.portal).toBe(true)

      consoleSpy.mockRestore()
    })

    it('redirects portal invite failure to the same invite login URL', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: 'secret-token-hash', portal: true })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/login')
      expect(location).toContain('type=invite')
      expect(location).toContain('error=auth_failed')

      consoleSpy.mockRestore()
    })
  })

  describe('verifyOtp success', () => {
    beforeEach(() => {
      mockVerifyOtp.mockResolvedValue({ error: null })
    })

    it('does not emit console.error on success', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: 'valid-hash' })
      await GET(request)

      expect(consoleSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('redirects to invite login with exchanged=1 on success (regular invite)', async () => {
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: 'valid-hash' })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/login')
      expect(location).toContain('type=invite')
      expect(location).toContain('exchanged=1')
    })

    it('redirects to portal accept-invite on success when portal=1', async () => {
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: 'valid-hash', portal: true })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/portal/accept-invite')
      expect(location).toContain('exchanged=1')
    })
  })

  describe('missing token_hash', () => {
    it('redirects to /login?error=missing_code when token_hash is absent', async () => {
      const { GET } = await loadRoute()

      // The GET handler guards with `isInvite && tokenHash`; when tokenHash is
      // absent the request falls through to the generic !code branch which
      // produces /login?error=missing_code (no type=invite).
      const request = makeInviteRequest({ tokenHash: null })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location') ?? ''
      expect(location).toContain('/login')
      expect(location).toContain('error=missing_code')
    })

    it('does not call verifyOtp when token_hash is absent', async () => {
      const { GET } = await loadRoute()

      const request = makeInviteRequest({ tokenHash: null })
      await GET(request)

      expect(mockVerifyOtp).not.toHaveBeenCalled()
    })
  })
})
