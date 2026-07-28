import { resolveRedirectPath } from '@/lib/auth/resolveRedirectPath'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { UserRole } from '@/types/users'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

function recoveryLoginUrl(origin: string, params?: Record<string, string>): string {
  const search = new URLSearchParams({ type: 'recovery', ...params })
  return `${origin}/login?${search}`
}

function inviteLoginUrl(origin: string, params?: Record<string, string>): string {
  const search = new URLSearchParams({ type: 'invite', ...params })
  return `${origin}/login?${search}`
}

function invitePortalUrl(origin: string, params?: Record<string, string>): string {
  const search = new URLSearchParams(params ?? {})
  const query = search.toString()
  return query ? `${origin}/portal/accept-invite?${query}` : `${origin}/portal/accept-invite`
}

function createRecoveryCookieClient(request: NextRequest, destination: string) {
  let response = NextResponse.redirect(destination)

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.redirect(destination)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  return { supabase, getResponse: () => response }
}

function recoveryFailureResponse(
  origin: string,
  sessionResponse: NextResponse,
): NextResponse {
  const failureResponse = NextResponse.redirect(recoveryLoginUrl(origin, { error: 'auth_failed' }))
  for (const cookie of sessionResponse.cookies.getAll()) {
    failureResponse.cookies.set(cookie.name, cookie.value)
  }
  return failureResponse
}

async function establishRecoverySession(
  request: NextRequest,
  origin: string,
  authenticate: (
    supabase: SupabaseClient<Database>,
  ) => Promise<{ error: { message: string } | null }>,
): Promise<NextResponse> {
  const destination = recoveryLoginUrl(origin, { exchanged: '1' })
  const { supabase, getResponse } = createRecoveryCookieClient(request, destination)

  await supabase.auth.signOut()

  const { error } = await authenticate(supabase)

  if (error) {
    return recoveryFailureResponse(origin, getResponse())
  }

  return getResponse()
}

async function exchangeRecoveryCode(
  request: NextRequest,
  code: string,
  origin: string,
): Promise<NextResponse> {
  return establishRecoverySession(request, origin, async (supabase) => {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    return { error }
  })
}

async function verifyRecoveryTokenHash(
  request: NextRequest,
  tokenHash: string,
  origin: string,
): Promise<NextResponse> {
  return establishRecoverySession(request, origin, async (supabase) => {
    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    })
    return { error }
  })
}

function createInviteCookieClient(request: NextRequest, destination: string) {
  let response = NextResponse.redirect(destination)

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.redirect(destination)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  return { supabase, getResponse: () => response }
}

async function establishInviteSession(
  request: NextRequest,
  origin: string,
  destination: string,
): Promise<NextResponse> {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  if (!tokenHash) {
    return NextResponse.redirect(inviteLoginUrl(origin, { error: 'missing_code' }))
  }

  const { supabase, getResponse } = createInviteCookieClient(request, destination)

  await supabase.auth.signOut()

  const { error } = await supabase.auth.verifyOtp({
    type: 'invite',
    token_hash: tokenHash,
  })

  if (error) {
    console.error('[auth/callback] invite token verification failed', {
      message: error.message,
      status: error.status,
      code: error.code,
      portal: requestUrl.searchParams.get('portal') === '1',
      host: requestUrl.host,
    })
    const failureResponse = NextResponse.redirect(inviteLoginUrl(origin, { error: 'auth_failed' }))
    for (const cookie of getResponse().cookies.getAll()) {
      failureResponse.cookies.set(cookie.name, cookie.value)
    }
    return failureResponse
  }

  return getResponse()
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const isRecovery = searchParams.get('recovery') === '1' || searchParams.get('type') === 'recovery'
  const isInvite = searchParams.get('invite') === '1' || searchParams.get('type') === 'invite'

  if (isInvite && tokenHash) {
    const destination = searchParams.get('portal') === '1'
      ? invitePortalUrl(origin, { exchanged: '1' })
      : inviteLoginUrl(origin, { exchanged: '1' })
    return establishInviteSession(request, origin, destination)
  }

  if (isRecovery && tokenHash) {
    return verifyRecoveryTokenHash(request, tokenHash, origin)
  }

  if (!code) {
    const missingTarget = isRecovery
      ? recoveryLoginUrl(origin, { error: 'missing_code' })
      : `${origin}/login?error=missing_code`
    return NextResponse.redirect(missingTarget)
  }

  if (isRecovery) {
    return exchangeRecoveryCode(request, code, origin)
  }

  if (isInvite && code) {
    const destination = searchParams.get('portal') === '1'
      ? invitePortalUrl(origin, { exchanged: '1' })
      : inviteLoginUrl(origin, { exchanged: '1' })
    const { supabase, getResponse } = createInviteCookieClient(request, destination)
    await supabase.auth.signOut()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const failureResponse = NextResponse.redirect(inviteLoginUrl(origin, { error: 'auth_failed' }))
      for (const cookie of getResponse().cookies.getAll()) {
        failureResponse.cookies.set(cookie.name, cookie.value)
      }
      return failureResponse
    }
    return getResponse()
  }

  const supabase = await createServerSupabaseClient()
  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

  if (sessionError) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let role: UserRole | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    role = (profile?.role as UserRole | null) ?? null
  }

  const destination = resolveRedirectPath(role)
  return NextResponse.redirect(`${origin}${destination}`)
}