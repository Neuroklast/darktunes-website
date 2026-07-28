/**
 * Regression tests for proxy.ts request-header propagation (i18n bundle bug).
 *
 * Root cause: `src/i18n/request.ts` and `app/portal/layout.tsx` read
 * `x-pathname` / `x-url` via `headers()`, which surfaces REQUEST headers —
 * not response headers. The previous implementation only set these on the
 * outgoing `NextResponse`, so `resolveBundle('')` always fell back to the
 * public `*` bundle (missing `portal` strings) on `/login`, `/portal/*`, etc.
 *
 * These tests assert that `x-pathname` / `x-url` are forwarded as REQUEST
 * headers by inspecting the `x-middleware-request-*` / *
 * `x-middleware-override-headers` markers Next.js attaches to
 * `NextResponse.next({ request: { headers } })`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockIsSupabaseEnvConfigured = vi.fn()
const mockGetUser = vi.fn()
const mockResolveEffectiveAccess = vi.fn()
const mockHasPortalArtistMembership = vi.fn()
const mockGetFeatureToggles = vi.fn()

vi.mock('@/lib/supabase/isConfigured', () => ({
  isSupabaseEnvConfigured: () => mockIsSupabaseEnvConfigured(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: () => mockGetUser(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))

vi.mock('@/lib/rbac', () => ({
  resolveEffectiveAccess: (...args: unknown[]) => mockResolveEffectiveAccess(...args),
  hasAdminPanelAccess: () => true,
  hasPressDashboardAccess: () => true,
}))

vi.mock('@/lib/portal/membership', () => ({
  hasPortalArtistMembership: (...args: unknown[]) => mockHasPortalArtistMembership(...args),
}))

vi.mock('@/lib/featureToggles', () => ({
  DEFAULT_FEATURE_TOGGLES: { editorTools: true },
  getFeatureToggles: (...args: unknown[]) => mockGetFeatureToggles(...args),
}))

vi.mock('@/lib/editor/editorAdminPaths', () => ({
  isEditorAllowedAdminPath: () => true,
}))

vi.mock('@/lib/auth/resolveRedirectPath', () => ({
  resolveRedirectPath: () => '/admin',
}))

function requestHeaderMarkers(response: Response): {
  overrideHeaders: string[]
  pathname: string | null
  url: string | null
} {
  const overrideHeaders = (response.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    overrideHeaders,
    pathname: response.headers.get('x-middleware-request-x-pathname'),
    url: response.headers.get('x-middleware-request-x-url'),
  }
}

async function loadProxy() {
  vi.resetModules()
  return import('../../../proxy')
}

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'))
}

describe('proxy — request-header propagation for i18n', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards x-pathname and x-url as REQUEST headers for a public route', async () => {
    mockIsSupabaseEnvConfigured.mockReturnValue(false)
    const { proxy } = await loadProxy()

    const response = await proxy(makeRequest('/'))
    const { overrideHeaders, pathname, url } = requestHeaderMarkers(response)

    expect(overrideHeaders).toEqual(expect.arrayContaining(['x-pathname', 'x-url']))
    expect(pathname).toBe('/')
    expect(url).toBe('http://localhost/')
  })

  it('forwards x-pathname as a REQUEST header for /login when Supabase env is unconfigured (CI placeholders)', async () => {
    mockIsSupabaseEnvConfigured.mockReturnValue(false)
    const { proxy } = await loadProxy()

    const response = await proxy(makeRequest('/login'))
    const { overrideHeaders, pathname } = requestHeaderMarkers(response)

    expect(overrideHeaders).toEqual(expect.arrayContaining(['x-pathname', 'x-url']))
    expect(pathname).toBe('/login')
  })

  it('forwards x-pathname as a REQUEST header for /login when Supabase is configured and unauthenticated', async () => {
    mockIsSupabaseEnvConfigured.mockReturnValue(true)
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { proxy } = await loadProxy()

    const response = await proxy(makeRequest('/login'))
    const { overrideHeaders, pathname } = requestHeaderMarkers(response)

    expect(overrideHeaders).toEqual(expect.arrayContaining(['x-pathname', 'x-url']))
    expect(pathname).toBe('/login')
  })

  it('forwards x-pathname as a REQUEST header for /portal/accept-invite (protected but header-dependent for i18n bundle)', async () => {
    mockIsSupabaseEnvConfigured.mockReturnValue(true)
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { proxy } = await loadProxy()

    const response = await proxy(makeRequest('/portal/accept-invite'))
    const { overrideHeaders, pathname } = requestHeaderMarkers(response)

    expect(overrideHeaders).toEqual(expect.arrayContaining(['x-pathname', 'x-url']))
    expect(pathname).toBe('/portal/accept-invite')
  })

  it('still redirects unauthenticated users away from protected routes (behavior unchanged)', async () => {
    mockIsSupabaseEnvConfigured.mockReturnValue(false)
    const { proxy } = await loadProxy()

    const response = await proxy(makeRequest('/admin'))

    expect(response.status).toBe(307)
    const location = response.headers.get('location') ?? ''
    expect(location).toContain('/login')
    expect(location).toContain('returnTo=%2Fadmin')
  })
})
