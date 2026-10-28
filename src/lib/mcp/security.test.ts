import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAllowedMcpOrigin, isAllowedOAuthClient, oauthIssuer } from './security'

afterEach(() => vi.unstubAllEnvs())
describe('MCP authentication boundary helpers', () => {
  it('rejects cross-origin browser requests', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darktunes.com')
    expect(isAllowedMcpOrigin(new Request('https://darktunes.com/mcp', {
      headers: { Origin: 'https://attacker.example' },
    }))).toBe(false)
  })
  it('accepts same-origin browsers and origin-less headless clients', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darktunes.com')
    expect(isAllowedMcpOrigin(new Request('https://darktunes.com/mcp', {
      headers: { Origin: 'https://darktunes.com' },
    }))).toBe(true)
    expect(isAllowedMcpOrigin(new Request('https://darktunes.com/mcp'))).toBe(true)
  })
  it('accepts the canonical www host even if an environment Site URL names the redirecting apex', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://darktunes.com')
    expect(isAllowedMcpOrigin(new Request('https://www.darktunes.com/mcp/news-draft-approvals', {
      headers: { Origin: 'https://www.darktunes.com' },
    }))).toBe(true)
  })
  it('rejects all clients until explicitly approved, and does not accept arbitrary OAuth clients', () => {
    vi.stubEnv('MCP_ALLOWED_OAUTH_CLIENT_IDS', '')
    expect(isAllowedOAuthClient('client-a')).toBe(false)
    vi.stubEnv('MCP_ALLOWED_OAUTH_CLIENT_IDS', 'client-a, client-b')
    expect(isAllowedOAuthClient('client-a')).toBe(true)
    expect(isAllowedOAuthClient('client-b')).toBe(true)
    expect(isAllowedOAuthClient('client-c')).toBe(false)
  })
  it('publishes only secure Supabase OAuth issuers', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    expect(oauthIssuer()).toBe('https://example.supabase.co/auth/v1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://external.example')
    expect(oauthIssuer()).toBeNull()
  })
})
