/**
 * Resume a successful sign-in with a validated same-origin returnTo.
 * Never preserve an old unauthorized/no_artist error parameter, since it
 * belongs to the previous browser session and can trap a new admin login.
 */
export function cleanPostLoginHref(search: string): string {
  const returnTo = new URLSearchParams(search).get('returnTo')
  if (
    !returnTo ||
    !returnTo.startsWith('/') ||
    returnTo.startsWith('//') ||
    returnTo.includes('\\')
  ) {
    return '/login'
  }

  const origin = 'https://post-login.invalid'
  const destination = new URL(returnTo, origin)
  if (destination.origin !== origin || destination.pathname === '/login') {
    return '/login'
  }

  return '/login?returnTo=' +
    encodeURIComponent(destination.pathname + destination.search)
}
