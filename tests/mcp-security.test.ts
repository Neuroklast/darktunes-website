import { afterEach, describe, expect, it } from 'vitest'
import { configuredMcpClients, mcpEnabled, mcpPublicOrigin } from '@/lib/mcp/config'
import { parseUpdate } from '@/lib/mcp/editorial'

const original = {
  enabled: process.env.DARKTUNES_MCP_ENABLED,
  clients: process.env.DARKTUNES_MCP_OAUTH_CLIENT_IDS,
  origin: process.env.DARKTUNES_MCP_PUBLIC_ORIGIN,
}
afterEach(() => {
  for (const [key, value] of Object.entries({
    DARKTUNES_MCP_ENABLED: original.enabled,
    DARKTUNES_MCP_OAUTH_CLIENT_IDS: original.clients,
    DARKTUNES_MCP_PUBLIC_ORIGIN: original.origin,
  })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('MCP security boundaries', () => {
  it('defaults disabled and never permits an empty client allowlist', () => {
    delete process.env.DARKTUNES_MCP_ENABLED
    delete process.env.DARKTUNES_MCP_OAUTH_CLIENT_IDS
    expect(mcpEnabled()).toBe(false)
    expect(configuredMcpClients().size).toBe(0)
  })
  it('parses only explicitly allowlisted client identifiers', () => {
    process.env.DARKTUNES_MCP_OAUTH_CLIENT_IDS = 'client-12345678, ,*,trusted-client-id'
    expect([...configuredMcpClients()]).toEqual(['client-12345678', 'trusted-client-id'])
  })
  it('rejects non-HTTPS production endpoints and userinfo', () => {
    process.env.DARKTUNES_MCP_PUBLIC_ORIGIN = 'https://user:password@darktunes.com'
    expect(mcpPublicOrigin()).toBe(null)
    process.env.DARKTUNES_MCP_PUBLIC_ORIGIN = 'https://darktunes.com'
    expect(mcpPublicOrigin()).toBe('https://darktunes.com')
  })
  it('rejects publication, financial and security fields', () => {
    expect(() => parseUpdate('news_posts', { status: 'published' })).toThrow()
    expect(() => parseUpdate('releases', { is_visible: 'true' })).toThrow()
    expect(() => parseUpdate('artists', { email: 'private@example.com' })).toThrow()
    expect(() => parseUpdate('artists', { bio: 'Valid biography' })).not.toThrow()
  })
  it('accepts safe streaming links but rejects malformed and credentialed URLs', () => {
    expect(parseUpdate('releases', { spotify_url: 'https://open.spotify.com/track/test' })).toEqual({
      spotify_url: 'https://open.spotify.com/track/test',
    })
    expect(() => parseUpdate('releases', { spotify_url: 'javascript:alert(1)' })).toThrow()
    expect(() => parseUpdate('releases', { spotify_url: 'https://user:pass@example.com/path' })).toThrow()
  })
  it('blocks raw HTML in MCP news body changes', () => {
    expect(() => parseUpdate('news_posts', { content: '<script>alert(1)</script>' })).toThrow()
  })
})
