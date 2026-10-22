import { describe, expect, it } from 'vitest'
import '@/lib/ai/tools'
import {
  executeRegisteredTool,
  getRegisteredTool,
  listToolDefinitionsForActor,
} from '@/lib/ai/tools/registry'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { Capability } from '@/lib/rbac/types'

function actor(overrides: Partial<AiActor>): AiActor {
  return {
    userId: 'user-1',
    role: 'artist',
    accessContext: 'artist',
    dashboard: 'portal',
    artistId: 'artist-1',
    artistMembershipIds: ['artist-1'],
    capabilities: new Set<Capability>(),
    availableArtists: [{ id: 'artist-1', name: 'Artist 1', slug: 'artist-1' }],
    serviceDb: {} as AiActor['serviceDb'],
    userDb: {} as AiActor['userDb'],
    ...overrides,
  }
}

function toolNames(overrides: Partial<AiActor>): string[] {
  return listToolDefinitionsForActor(actor(overrides)).map((tool) => tool.name)
}

describe('tool registry', () => {
  it('should run echo_test and reject unknown tools', async () => {
    const artist = actor({})
    expect(getRegisteredTool('echo_test')?.classification).toBe('read')
    const ok = await executeRegisteredTool('echo_test', { ping: 'hi' }, { actor: artist, requestId: 'r1' })
    expect(ok).toEqual({ ok: true, result: { pong: 'hi' } })
    const unknown = await executeRegisteredTool('drop_database', {}, { actor: artist, requestId: 'r1' })
    expect(unknown).toEqual({ ok: false, error: 'Unknown tool: drop_database' })
  })

  it('should reject invalid echo arguments', async () => {
    const result = await executeRegisteredTool(
      'echo_test',
      { nope: 1 },
      { actor: actor({}), requestId: 'r1' },
    )
    expect(result.ok).toBe(false)
  })

  it('gives an artist their own tools but no label tools', () => {
    const names = toolNames({})
    expect(names).toContain('get_artist_profile')
    expect(names).toContain('get_artist_releases')
    expect(names).toContain('prepare_epk_text')
    expect(names).not.toContain('get_label_analytics')
    expect(names).not.toContain('get_system_health')
    expect(names).not.toContain('get_pending_submissions')
  })

  it('gives a label admin label tools but not self-artist tools without an artist', () => {
    const names = toolNames({
      role: 'admin',
      accessContext: 'admin',
      dashboard: 'admin',
      artistId: null,
      artistMembershipIds: [],
      capabilities: new Set<Capability>(['admin.panel.full', 'admin.panel.editor']),
    })
    expect(names).toContain('get_system_health')
    expect(names).toContain('get_label_analytics')
    expect(names).not.toContain('get_artist_profile')
    expect(names).not.toContain('prepare_epk_text')
  })

  it('gives an admin with a selected artist both label and artist tools', () => {
    const names = toolNames({
      role: 'admin',
      accessContext: 'admin',
      dashboard: 'admin',
      capabilities: new Set<Capability>(['admin.panel.full', 'cms.artists.manage']),
    })
    expect(names).toContain('get_system_health')
    expect(names).toContain('get_artist_profile')
    expect(names).toContain('prepare_epk_text')
  })

  it('limits an editor to editor-capable label tools', () => {
    const names = toolNames({
      role: 'editor',
      accessContext: 'editor',
      dashboard: 'editor',
      artistId: null,
      artistMembershipIds: [],
      capabilities: new Set<Capability>(['admin.panel.editor']),
    })
    expect(names).toContain('get_pending_submissions')
    expect(names).not.toContain('get_system_health')
    expect(names).not.toContain('get_label_analytics')
  })

  it('denies a label tool at execution even if a caller bypasses visibility', async () => {
    const result = await executeRegisteredTool(
      'get_system_health',
      {},
      { actor: actor({}), requestId: 'r1' },
    )
    expect(result).toMatchObject({ ok: false, error_code: 'AI_TOOL_FORBIDDEN' })
  })

  it('does not expose artist tools for an artist outside the membership list', () => {
    const names = toolNames({
      artistId: 'artist-2',
      artistMembershipIds: ['artist-1'],
    })
    expect(names).not.toContain('get_artist_profile')
    expect(names).not.toContain('prepare_epk_text')
  })
})
