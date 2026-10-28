import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAllowedMcpOrigin, oauthIssuer } from './security'

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
  it('publishes only secure Supabase OAuth issuers', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    expect(oauthIssuer()).toBe('https://example.supabase.co/auth/v1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://external.example')
    expect(oauthIssuer()).toBeNull()
  })
})
