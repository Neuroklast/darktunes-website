import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, requireActor } = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireActor: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser } })),
}))
vi.mock('@/lib/ai/auth/requireAiActor', () => ({
  requireAiActor: requireActor,
}))

import { authenticateMcp } from './security'

function oauthToken(claims: Record<string, unknown>): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'test-signature',
  ].join('.')
}

function request(token?: string): NextRequest {
  return new NextRequest('https://www.darktunes.com/mcp', {
    method: 'POST',
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  })
}

beforeEach(() => {
  vi.stubEnv('MCP_ALLOWED_OAUTH_CLIENT_IDS', 'approved-client')
  getUser.mockResolvedValue({ data: { user: { id: 'editor-1' } }, error: null })
  requireActor.mockResolvedValue({ userId: 'editor-1', role: 'editor', capabilities: new Set(['cms.news.edit']) })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('MCP OAuth authentication without an MFA requirement', () => {
  it('accepts a verified OAuth AAL1 session for an allowlisted editor', async () => {
    const token = oauthToken({ sub: 'editor-1', client_id: 'approved-client', aal: 'aal1' })
    expect(await authenticateMcp(request(token))).toMatchObject({ userId: 'editor-1', role: 'editor' })
    expect(getUser).toHaveBeenCalledWith(token)
  })

  it('does not require an aal claim if Supabase has verified the OAuth token', async () => {
    const token = oauthToken({ sub: 'editor-1', client_id: 'approved-client' })
    expect(await authenticateMcp(request(token))).toMatchObject({ userId: 'editor-1' })
  })

  it('still rejects an unapproved OAuth client', async () => {
    const token = oauthToken({ sub: 'editor-1', client_id: 'other-client', aal: 'aal1' })
    expect(await authenticateMcp(request(token))).toBeNull()
  })

  it('still rejects mismatched user identities and ordinary portal tokens', async () => {
    const mismatch = oauthToken({ sub: 'other-user', client_id: 'approved-client', aal: 'aal1' })
    const noClientId = oauthToken({ sub: 'editor-1', aal: 'aal1' })
    expect(await authenticateMcp(request(mismatch))).toBeNull()
    expect(await authenticateMcp(request(noClientId))).toBeNull()
  })

  it('still rejects invalid or missing authentication and users without editor rights', async () => {
    expect(await authenticateMcp(request())).toBeNull()
    getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid token') })
    expect(await authenticateMcp(request(oauthToken({ sub: 'editor-1', client_id: 'approved-client' })))).toBeNull()
    requireActor.mockResolvedValueOnce({ userId: 'editor-1', role: 'artist' })
    expect(await authenticateMcp(request(oauthToken({ sub: 'editor-1', client_id: 'approved-client' })))).toBeNull()
  })
})
