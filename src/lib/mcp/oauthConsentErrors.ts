/**
 * Supabase OAuth-server errors need actionable messaging. The authorization ID
 * and bearer credentials must never appear in the rendered diagnostics.
 */
export type OAuthConsentFailure = {
  message?: string
  code?: string
  status?: number
}

export function describeOAuthConsentFailure(
  failure: OAuthConsentFailure | null,
  websiteOrigin: string,
): { message: string; diagnostic: string } {
  const message = failure?.message ?? ''
  const code = failure?.code ?? 'unknown'
  const status = failure?.status ?? 'unknown'
  const diagnostic = `Supabase Auth: HTTP ${status}, code ${code}`

  if (/unauthorized request origin/i.test(message)) {
    return {
      message: `Supabase does not permit the origin ${websiteOrigin} for this authorization. The Supabase project owner must allow this origin in Authentication > URL Configuration and verify the OAuth Server authorization path.`,
      diagnostic,
    }
  }

  if (
    code === 'oauth_authorization_not_found' ||
    /authorization not found|authorization request cannot be processed|authorization request is no longer pending/i.test(message)
  ) {
    return {
      message: 'This authorization request has expired, was already used, or belongs to another session. Start a new connection from ChatGPT instead of reloading this page.',
      diagnostic,
    }
  }

  if (/authentication required|invalid jwt/i.test(message) || code === 'bad_jwt') {
    return {
      message: 'Your darkTunes login session is not valid for the OAuth request. Sign in again and start a new connection from ChatGPT.',
      diagnostic,
    }
  }

  return {
    message: 'Supabase could not verify the authorization request. Check the Auth error response in your browser Network tab, then start a new connection from ChatGPT.',
    diagnostic,
  }
}
