import type { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))
vi.mock('@/lib/ai/auth/requireAiActor', () => ({
  requireAiActor: vi.fn(),
}))

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { authenticateMcp } from './security'

const sessions = new Map<string, { userId: string; verifiedUserId?: string; revoked?: boolean }>()

function oauthToken(userId: string, clientId: string, aal = 'aal2') {
  // Fake JWTs are accepted only by the mocked Supabase Auth server below.
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: userId, client_id: clientId, aal,
  })).toString('base64url')
  const token = header + '.' + payload + '.signature'
  sessions.set(token, { userId })
  return token
}

function request(token: string): NextRequest {
  return new Request('https://www.darktunes.com/mcp', {
    headers: { Authorization: 'Bearer ' + token },
  }) as unknown as NextRequest
}

function actor(userId: string, role: 'admin' | 'editor' | 'artist'): AiActor {
  return {
    userId, role, accessContext: role, dashboard: role === 'artist' ? 'portal' : 'admin',
    artistId: null, artistMembershipIds: [],
    capabilities: new Set(), availableArtists: [],
    serviceDb: {} as AiActor['serviceDb'],
    userDb: {} as AiActor['userDb'],
  }
}

beforeEach(() => {
  sessions.clear()
  vi.stubEnv('MCP_ALLOWED_OAUTH_CLIENT_IDS', 'workspace-client, second-approved-client')
  const getUser = vi.fn(async (token: string) => {
    const session = sessions.get(token)
    if (!session || session.revoked) {
      return { data: { user: null }, error: { message: 'Token invalid or revoked' } }
    }
    return {
      data: { user: { id: session.verifiedUserId ?? session.userId } },
      error: null,
    }
  })
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: { getUser },
  } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>)
  vi.mocked(requireAiActor).mockImplementation(async (req) => {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
    const session = sessions.get(token)
    if (!session) throw new Error('No matching darkTunes account')
    return actor(session.userId, session.userId === 'artist' ? 'artist'
      : session.userId === 'editor' ? 'editor' : 'admin')
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('shared ChatGPT MCP user isolation', () => {
  it('lets two different accounts authenticate against the same approved OAuth client', async () => {
    const first = oauthToken('admin', 'workspace-client')
    const second = oauthToken('editor', 'workspace-client')
    const [admin, editor] = await Promise.all([
      authenticateMcp(request(first)),
      authenticateMcp(request(second)),
    ])

    expect(admin?.userId).toBe('admin')
    expect(admin?.role).toBe('admin')
    expect(editor?.userId).toBe('editor')
    expect(editor?.role).toBe('editor')
    expect(requireAiActor).toHaveBeenCalledTimes(2)
  })

  it('supports multiple explicitly approved OAuth client IDs without a wildcard', async () => {
    expect((await authenticateMcp(request(oauthToken('admin', 'second-approved-client'))))?.userId)
      .toBe('admin')
    expect(await authenticateMcp(request(oauthToken('admin', 'unapproved-client'))))
      .toBeNull()
    vi.stubEnv('MCP_ALLOWED_OAUTH_CLIENT_IDS', '')
    expect(await authenticateMcp(request(oauthToken('admin', 'workspace-client'))))
      .toBeNull()
  })

  it('rejects a token whose validated Supabase user does not match its subject', async () => {
    const token = oauthToken('admin', 'workspace-client')
    sessions.get(token)!.verifiedUserId = 'editor'
    expect(await authenticateMcp(request(token))).toBeNull()
    expect(requireAiActor).not.toHaveBeenCalled()
  })

  it('rejects a request whose server-resolved darkTunes actor is another user', async () => {
    const token = oauthToken('admin', 'workspace-client')
    vi.mocked(requireAiActor).mockResolvedValueOnce(actor('editor', 'editor'))
    expect(await authenticateMcp(request(token))).toBeNull()
  })

  it('rejects revoked tokens while accepting normal single-factor OAuth sessions', async () => {
    const revoked = oauthToken('admin', 'workspace-client')
    sessions.get(revoked)!.revoked = true
    expect(await authenticateMcp(request(revoked))).toBeNull()
    expect(await authenticateMcp(request(oauthToken('admin', 'workspace-client', 'aal1'))))
      .toMatchObject({ userId: 'admin', role: 'admin' })
  })

  it('rejects artist accounts even with a valid approved OAuth client', async () => {
    const token = oauthToken('artist', 'workspace-client')
    expect(await authenticateMcp(request(token))).toBeNull()
  })
})
