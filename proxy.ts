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

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveRedirectPath } from '@/lib/auth/resolveRedirectPath'
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

function redirectUnauthenticatedToLogin(request: NextRequest): NextResponse {
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('returnTo', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

function redirectToLoginWithError(request: NextRequest, error: string): NextResponse {
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('error', error)
  return NextResponse.redirect(loginUrl)
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

  // Public routes (not protected, not login): inject x-pathname and return immediately
  // to avoid unnecessary auth overhead on every public page request.
  if (!protectedRoute && !route.isLoginPage) {
    const res = NextResponse.next({ request })
    res.headers.set('x-pathname', pathname)
    return res
  }

  // CI placeholder credentials: enforce route redirects without calling Supabase
  // (avoids slow/hanging auth against fake hosts while keeping protected routes gated).
  if (!isSupabaseEnvConfigured()) {
    if (protectedRoute && !route.isLoginPage && !route.isPortalAcceptInvitePage) {
      return redirectUnauthenticatedToLogin(request)
    }
    const res = NextResponse.next({ request })
    res.headers.set('x-pathname', pathname)
    return res
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
        },
      },
    },
  )

  // Refresh the session — do not run any code between createServerClient
  // and getUser() or the session might not update properly.
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
      await supabase.auth.signOut()
    }
    // Must set x-pathname here too, or the request never reaches the shared
    // header assignment below and next-intl falls back to the public "*"
    // namespace bundle (no "portal" strings — raw "portal.xxx" keys render).
    supabaseResponse.headers.set('x-pathname', pathname)
    return supabaseResponse
  }

  // Invite links must let the user set a password before role-based redirects.
  if (isLoginPage && request.nextUrl.searchParams.get('type') === 'invite') {
    supabaseResponse.headers.set('x-pathname', pathname)
    return supabaseResponse
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
    effectiveAccess = await resolveEffectiveAccess(supabase, user.id)
    profileRole = effectiveAccess.primaryRole
  }

  // Central Login Redirection Logic for Authenticated Users
  if (isLoginPage && user && profileRole) {
    if (shouldStayOnLoginPage(request.nextUrl.searchParams)) {
      supabaseResponse.headers.set('x-pathname', pathname)
      return supabaseResponse
    }

    const returnTo = request.nextUrl.searchParams.get('returnTo')
    const url = request.nextUrl.clone()

    // Validate returnTo to prevent open redirects (only allow local paths)
    if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      url.pathname = returnTo
      url.search = ''
      return NextResponse.redirect(url)
    }

    url.pathname = resolveRedirectPath(profileRole)
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Redirect unauthenticated users away from protected routes
  if (isProtectedRoute && !isLoginPage && !isPortalAcceptInvitePage && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // --- Admin/Editor route protection ---
  if ((isAdminRoute || isEditorRoute) && user && effectiveAccess) {
    const hasAdminAccess = hasAdminPanelAccess(effectiveAccess)

    if (isEditorRoute && effectiveAccess.isAdmin) {
      const adminUrl = request.nextUrl.clone()
      adminUrl.pathname = '/admin'
      adminUrl.search = ''
      return NextResponse.redirect(adminUrl)
    }

    if (isEditorRoute && !hasAdminAccess) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(loginUrl)
    }

    if (isEditorRoute && profileRole === 'editor') {
      const toggles = await getFeatureToggles(supabase).catch(() => DEFAULT_FEATURE_TOGGLES)
      if (!toggles.editorTools) {
        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.searchParams.set('error', 'unauthorized')
        return NextResponse.redirect(loginUrl)
      }
    }

    if (isAdminRoute && profileRole === 'editor' && !isEditorAllowedAdminPath(pathname)) {
      const editorUrl = request.nextUrl.clone()
      editorUrl.pathname = '/editor'
      editorUrl.search = ''
      return NextResponse.redirect(editorUrl)
    }

    if (!hasAdminAccess) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(loginUrl)
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
        return redirectToLoginWithError(request, 'no_artist')
      }

      if (!hasMembership) {
        return redirectToLoginWithError(request, 'no_artist')
      }
    }
  }

  // --- Press Dashboard protection ---
  if (isPressDashboardRoute && user && effectiveAccess) {
    if (!hasPressDashboardAccess(effectiveAccess)) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(loginUrl)
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

  // Forward the current pathname as a request header so Server Components
  // (e.g. app/portal/layout.tsx) can read it without importing next/headers
  // in a way that requires a client context.
  supabaseResponse.headers.set('x-pathname', pathname)
  // Forward the full URL (including query string) so portal layout can extract ?artistId
  supabaseResponse.headers.set('x-url', request.url)

  return supabaseResponse
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