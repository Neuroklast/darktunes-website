/**
 * proxy.ts — Next.js request proxy (formerly Edge Middleware)
 *
 * Intercepts all requests BEFORE the page renders, allowing auth checks
 * to redirect unauthenticated users away from /admin without any client-side
 * "flicker" (i.e. no momentary flash of protected content).
 *
 * Auth strategy:
 *   - Any request to /admin/* (except /admin/login) requires a valid
 *     Supabase session cookie AND a role of 'admin' or 'editor'.
 *   - If no session is found, redirect to /admin/login.
 *   - If a session exists but the role is insufficient, redirect to /admin/login?error=unauthorized.
 *   - If a session with sufficient role exists and the user visits /admin/login, redirect to /admin.
 *
 * The proxy also refreshes the Supabase session cookie on every request
 * so tokens stay alive for active users.
 */

import { buildContentSecurityPolicy } from '@/lib/security/contentSecurityPolicy'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveRedirectPath } from '@/lib/auth/resolveRedirectPath'
import { preserveAuthResponse } from '@/lib/auth/preserveAuthResponse'
import { isEditorAllowedAdminPath } from '@/lib/editor/editorAdminPaths'
import { DEFAULT_FEATURE_TOGGLES, getFeatureToggles } from '@/lib/featureToggles'
import { hasPortalArtistMembership } from '@/lib/portal/membership'
import {
  hasAdminPanelAccess,
  hasPressDashboardAccess,
  resolveEffectiveAccess,
} from '@/lib/rbac'
import { isSupabaseEnvConfigured } from '@/lib/supabase/isConfigured'
import type { UserRole } from '@/types/users'

function classifyRoute(pathname: string) {
  return {
    isLoginPage: pathname === '/login',
    isAdminRoute: pathname.startsWith('/admin'),
    isEditorRoute: pathname.startsWith('/editor'),
    isPortalAcceptInvitePage: pathname === '/portal/accept-invite',
    isPortalRoute: pathname.startsWith('/portal'),
    isPressDashboardRoute: pathname.startsWith('/press/dashboard'),
    isPromoPoolRoute: pathname.startsWith('/promo-pool'),
    isAccountRoute: pathname.startsWith('/account'),
  }
}

function routeIsProtected(flags: ReturnType<typeof classifyRoute>): boolean {
  return (
    flags.isAdminRoute ||
    flags.isEditorRoute ||
    flags.isPortalRoute ||
    flags.isPressDashboardRoute ||
    flags.isPromoPoolRoute ||
    flags.isAccountRoute
  )
}

/**
 * Stamps the request-context headers that every pass-through response must carry.
 *
 * src/i18n/request.ts resolves its i18n namespace bundle from x-pathname, and
 * app/portal/layout.tsx reads x-pathname / x-url. A response returned without
 * them silently degrades to the public ('*') bundle, dropping route-specific
 * namespaces — e.g. `portal` on /login, which then renders MISSING_MESSAGE.
 * Redirects are exempt: the follow-up request is proxied again from scratch.
 */
function withRequestContext(res: NextResponse, request: NextRequest): NextResponse {
  res.headers.set('x-pathname', request.nextUrl.pathname)
  res.headers.set('x-url', request.url)
  const nonce = request.headers.get('x-nonce')
  if (nonce) {
    res.headers.set('Content-Security-Policy', buildContentSecurityPolicy({ nonce, development: process.env.NODE_ENV === 'development' }))
    res.headers.set('Cache-Control', 'private, no-store')
  }
  return res
}

function redirectUnauthenticatedToLogin(request: NextRequest): NextResponse {
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('returnTo', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

function redirectToLoginWithError(
  request: NextRequest,
  error: string,
  sessionResponse: NextResponse,
): NextResponse {
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('error', error)
  return preserveAuthResponse(sessionResponse, NextResponse.redirect(loginUrl))
}

function shouldStayOnLoginPage(searchParams: URLSearchParams): boolean {
  if (searchParams.get('type') === 'invite') return true
  const error = searchParams.get('error')
  return error === 'no_artist' || error === 'unauthorized'
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const route = classifyRoute(pathname)
  const protectedRoute = routeIsProtected(route)
  // Never accept a nonce supplied by a caller. Next extracts this request CSP
  // during dynamic rendering and stamps its hydration/runtime scripts.
  request.headers.delete('x-nonce')
  request.headers.delete('Content-Security-Policy')
  if (protectedRoute || route.isLoginPage) {
    const nonce = crypto.randomUUID().replaceAll('-', '')
    request.headers.set('x-nonce', nonce)
    request.headers.set('Content-Security-Policy', buildContentSecurityPolicy({ nonce, development: process.env.NODE_ENV === 'development' }))
  }

  // Public routes (not protected, not login): inject request context and return
  // immediately to avoid unnecessary auth overhead on every public page request.
  if (!protectedRoute && !route.isLoginPage) {
    return withRequestContext(NextResponse.next({ request }), request)
  }

  // CI placeholder credentials: enforce route redirects without calling Supabase
  // (avoids slow/hanging auth against fake hosts while keeping protected routes gated).
  if (!isSupabaseEnvConfigured()) {
    if (protectedRoute && !route.isLoginPage && !route.isPortalAcceptInvitePage) {
      return redirectUnauthenticatedToLogin(request)
    }
    return withRequestContext(NextResponse.next({ request }), request)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
          // Supabase rotated a user-specific cookie. Never cache this response.
          supabaseResponse.headers.set('Cache-Control', 'private, no-store')
          supabaseResponse.headers.set('Pragma', 'no-cache')
          supabaseResponse.headers.set('Expires', '0')
        },
      },
    },
  )

  // Verify the signed token and rotate stale SSR cookies before any role reads.
  // getClaims() is the Supabase SSR-recommended refresh path for Next.js Proxy.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const user = !claimsError && typeof claimsData?.claims?.sub === 'string'
    ? { id: claimsData.claims.sub }
    : null

  const isLoginPage = route.isLoginPage
  const isPasswordRecoveryLogin =
    isLoginPage && request.nextUrl.searchParams.get('type') === 'recovery'

  // Recovery links must apply to the emailed account — never a stale browser session.
  // Keep sessions only after /auth/callback sets exchanged=1. Otherwise clear any
  // active session (legacy ?code= on /login or a logged-in user opening recovery).
  if (isPasswordRecoveryLogin) {
    const hasRecoveryCode = request.nextUrl.searchParams.has('code')
    const hasExchangedCode = request.nextUrl.searchParams.get('exchanged') === '1'
    if (user && (hasRecoveryCode || !hasExchangedCode)) {
      await supabase.auth.signOut({ scope: 'local' })
    }
    return withRequestContext(supabaseResponse, request)
  }

  // Invite links must let the user set a password before role-based redirects.
  if (isLoginPage && request.nextUrl.searchParams.get('type') === 'invite') {
    return withRequestContext(supabaseResponse, request)
  }

  const isAdminRoute = route.isAdminRoute
  const isEditorRoute = route.isEditorRoute
  const isPortalAcceptInvitePage = route.isPortalAcceptInvitePage
  const isPortalRoute = route.isPortalRoute
  const isPressDashboardRoute = route.isPressDashboardRoute
  const isProtectedRoute = protectedRoute

  // Resolve role + effective capabilities once per protected request.
  let profileRole: UserRole | null = null
  let effectiveAccess: Awaited<ReturnType<typeof resolveEffectiveAccess>> | null = null
  if (user && (isProtectedRoute || isLoginPage)) {
    try {
      effectiveAccess = await resolveEffectiveAccess(supabase, user.id)
      profileRole = effectiveAccess.primaryRole
    } catch {
      // Fail closed without falsely telling the user that their role was
      // revoked. Retain any freshly rotated auth cookies for the next retry.
      const unavailableUrl = request.nextUrl.clone()
      unavailableUrl.pathname = '/auth/session-unavailable'
      unavailableUrl.search = ''
      const unavailable = NextResponse.rewrite(unavailableUrl, { status: 503 })
      return preserveAuthResponse(supabaseResponse, withRequestContext(unavailable, request))
    }
  }

  // Central Login Redirection Logic for Authenticated Users
  if (isLoginPage && user && profileRole) {
    // A stale ?error=unauthorized must not trap a valid admin on /login.
    // Non-admins keep the form so they can switch to an authorized account.
    if (
      shouldStayOnLoginPage(request.nextUrl.searchParams) &&
      (!effectiveAccess || !hasAdminPanelAccess(effectiveAccess))
    ) {
      return withRequestContext(supabaseResponse, request)
    }

    const returnTo = request.nextUrl.searchParams.get('returnTo')
    const url = request.nextUrl.clone()

    // Parse path and query separately. OAuth consent must survive the sign-in round trip.
    // A same-origin check plus backslash rejection prevents protocol-relative / alternate-host redirects.
    if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\')) {
      const destination = new URL(returnTo, url.origin)
      if (destination.origin === url.origin && destination.pathname !== '/login') {
        url.pathname = destination.pathname
        url.search = destination.search
        return preserveAuthResponse(supabaseResponse, NextResponse.redirect(url))
      }
    }

    url.pathname = resolveRedirectPath(profileRole)
    url.search = ''
    return preserveAuthResponse(supabaseResponse, NextResponse.redirect(url))
  }

  // Redirect unauthenticated users away from protected routes
  if (isProtectedRoute && !isLoginPage && !isPortalAcceptInvitePage && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname)
    return preserveAuthResponse(supabaseResponse, NextResponse.redirect(loginUrl))
  }

  // --- Admin/Editor route protection ---
  if ((isAdminRoute || isEditorRoute) && user && effectiveAccess) {
    const hasAdminAccess = hasAdminPanelAccess(effectiveAccess)

    if (isEditorRoute && effectiveAccess.isAdmin) {
      const adminUrl = request.nextUrl.clone()
      adminUrl.pathname = '/admin'
      adminUrl.search = ''
      return preserveAuthResponse(supabaseResponse, NextResponse.redirect(adminUrl))
    }

    if (isEditorRoute && !hasAdminAccess) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('error', 'unauthorized')
      return preserveAuthResponse(supabaseResponse, NextResponse.redirect(loginUrl))
    }

    if (isEditorRoute && profileRole === 'editor') {
      const toggles = await getFeatureToggles(supabase).catch(() => DEFAULT_FEATURE_TOGGLES)
      if (!toggles.editorTools) {
        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.searchParams.set('error', 'unauthorized')
        return preserveAuthResponse(supabaseResponse, NextResponse.redirect(loginUrl))
      }
    }

    if (isAdminRoute && profileRole === 'editor' && !isEditorAllowedAdminPath(pathname)) {
      const editorUrl = request.nextUrl.clone()
      editorUrl.pathname = '/editor'
      editorUrl.search = ''
      return preserveAuthResponse(supabaseResponse, NextResponse.redirect(editorUrl))
    }

    if (!hasAdminAccess) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('error', 'unauthorized')
      return preserveAuthResponse(supabaseResponse, NextResponse.redirect(loginUrl))
    }
  }

  // --- Portal route protection ---
  if (isPortalRoute && !isPortalAcceptInvitePage && user && effectiveAccess) {
    const isAdmin = effectiveAccess.isAdmin

    if (!isAdmin) {
      let hasMembership = false
      try {
        hasMembership = await hasPortalArtistMembership(supabase, user.id)
      } catch {
        return redirectToLoginWithError(request, 'no_artist', supabaseResponse)
      }

      if (!hasMembership) {
        return redirectToLoginWithError(request, 'no_artist', supabaseResponse)
      }
    }
  }

  // --- Press Dashboard protection ---
  if (isPressDashboardRoute && user && effectiveAccess) {
    if (!hasPressDashboardAccess(effectiveAccess)) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('error', 'unauthorized')
      return preserveAuthResponse(supabaseResponse, NextResponse.redirect(loginUrl))
    }
  }

  // --- Account route protection (/account/*) ---
  // (Handled by the generic unauthenticated check above, but if they are logged in, allow access to /account)

  // -------------------------------------------------------------------------
  // Locale detection — set NEXT_LOCALE cookie from Accept-Language if missing
  // -------------------------------------------------------------------------
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
  const validLocales = new Set(['en', 'de', 'fr'])
  if (!cookieLocale || !validLocales.has(cookieLocale)) {
    const acceptLanguage = request.headers.get('accept-language') ?? ''
    const primary = acceptLanguage.split(',')[0]?.split(';')[0]?.trim().split('-')[0]?.toLowerCase()
    const detectedLocale =
      primary === 'en' ? 'en' : primary === 'de' ? 'de' : primary === 'fr' ? 'fr' : 'en'
    supabaseResponse.cookies.set('NEXT_LOCALE', detectedLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    })
  }

  // Forward the current pathname (for i18n bundle + nav state) and the full URL
  // (so the portal layout can extract ?artistId) to Server Components.
  return withRequestContext(supabaseResponse, request)
}

export const config = {
  matcher: [
    /*
     * Match every path except Next.js internals and static assets.
     * Auth and i18n header injection must cover all routes, including public ones.
     */
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
}