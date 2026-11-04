import type { NextResponse } from 'next/server'

/**
 * Supabase can rotate or delete cookies while checking the user's session.
 * A new NextResponse.redirect() loses those Set-Cookie headers unless they
 * are copied from the response produced by the auth client.
 */
export function preserveAuthResponse(
  sessionResponse: NextResponse,
  response: NextResponse,
): NextResponse {
  response.cookies.setAll(sessionResponse.cookies.getAll())
  for (const header of ['cache-control', 'expires', 'pragma']) {
    const value = sessionResponse.headers.get(header)
    if (value !== null) response.headers.set(header, value)
  }
  return response
}
