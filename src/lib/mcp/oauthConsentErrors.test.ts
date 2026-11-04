import { describe, expect, it } from 'vitest'
import { describeOAuthConsentFailure } from './oauthConsentErrors'

describe('MCP OAuth consent diagnostics', () => {
  const origin = 'https://www.darktunes.com'

  it('identifies disallowed origins instead of claiming a request expired', () => {
    const result = describeOAuthConsentFailure(
      { message: 'unauthorized request origin', code: 'validation_failed', status: 400 }, origin,
    )
    expect(result.message).toContain(origin)
    expect(result.message).toContain('URL Configuration')
    expect(result.diagnostic).toContain('HTTP 400')
    expect(result.diagnostic).toContain('validation_failed')
  })

  it('directs used or missing authorizations back to a new OAuth flow', () => {
    const used = describeOAuthConsentFailure(
      { message: 'authorization request cannot be processed', status: 400 }, origin,
    )
    const missing = describeOAuthConsentFailure(
      { code: 'oauth_authorization_not_found', status: 404 }, origin,
    )
    expect(used.message).toContain('new connection from ChatGPT')
    expect(missing.message).toContain('new connection from ChatGPT')
  })

  it('distinguishes an invalid user session from a stale OAuth request', () => {
    const result = describeOAuthConsentFailure(
      { message: 'authentication required', code: 'bad_jwt', status: 403 }, origin,
    )
    expect(result.message).toContain('Sign in again')
  })

  it('preserves unknown error status and code for troubleshooting', () => {
    const result = describeOAuthConsentFailure(
      { message: 'validation failed', code: 'validation_failed', status: 400 }, origin,
    )
    expect(result.message).toContain('validation failed')
    expect(result.diagnostic).toBe('Supabase Auth: HTTP 400, code validation_failed')
  })
})
