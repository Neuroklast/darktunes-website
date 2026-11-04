import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { Capability } from '@/lib/rbac/types'

vi.mock('@/lib/rbac/resolveAccess', () => ({
  resolveEffectiveAccess: vi.fn(),
}))

import '@/lib/ai/tools/mcpContent'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import { executeRegisteredTool, listToolDefinitionsForActor } from '@/lib/ai/tools/registry'

type AuditRow = {
  request_id: string
  actor_id: string
  tool_name: string
  status: string
  error_code: string | null
}
const auditRows: AuditRow[] = []
const currentGrants = new Map<string, Set<Capability>>()

function serviceDb(): AiActor['serviceDb'] {
  return {
    from: (table: string) => {
      if (table === 'ai_tool_executions') {
        return {
          insert: async (row: AuditRow) => {
            auditRows.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'news_posts') {
        return {
          select: () => ({
            order: () => ({
              limit: async () => ({
                data: [{
                  id: 'news-1', title: 'Editorial note', slug: 'editorial-note',
                  status: 'draft', published_at: null,
                }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'concerts') {
        return {
          select: () => ({
            gte: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{
                    id: 'event-1', event_name: 'Festival', concert_date: '2099-01-01',
                    venue_name: null, venue_city: null, status: 'confirmed',
                    ticket_url: null,
                  }],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      throw new Error('Unexpected table in MCP test: ' + table)
    },
  } as unknown as AiActor['serviceDb']
}

function actor(userId: string, role: 'admin' | 'editor', capabilities: Capability[]): AiActor {
  const db = serviceDb()
  return {
    userId, role, accessContext: role, dashboard: 'admin', artistId: null,
    artistMembershipIds: [], capabilities: new Set(capabilities),
    availableArtists: [], serviceDb: db, userDb: db,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  auditRows.length = 0
  currentGrants.clear()
  vi.mocked(resolveEffectiveAccess).mockImplementation(async (_db, userId) => {
    const primaryRole: 'admin' | 'editor' = userId === 'admin-1' ? 'admin' : 'editor'
    return {
      primaryRole,
      allRoles: [primaryRole],
      permissions: new Set<string>(),
      capabilities: currentGrants.get(userId) ?? new Set<Capability>(),
      customRoleNames: [],
      isAdmin: userId === 'admin-1',
    }
  })
})

describe('MCP per-user CMS permissions and audit', () => {
  it('exposes different tools to two users sharing one ChatGPT plugin', async () => {
    const first = actor('admin-1', 'admin', ['cms.news.edit'])
    const second = actor('editor-2', 'editor', ['admin.panel.editor'])

    const names = (a: AiActor) => listToolDefinitionsForActor(a).map((tool) => tool.name)
    expect(names(first)).toContain('list_cms_news')
    expect(names(first)).not.toContain('list_cms_events')
    expect(names(second)).toContain('list_cms_events')
    expect(names(second)).not.toContain('list_cms_news')
  })

  it('logs each successful user action under its own actor ID, never under a shared client', async () => {
    const first = actor('admin-1', 'admin', ['cms.news.edit'])
    const second = actor('editor-2', 'editor', ['admin.panel.editor'])
    currentGrants.set(first.userId, new Set(first.capabilities))
    currentGrants.set(second.userId, new Set(second.capabilities))

    const news = await executeRegisteredTool('list_cms_news', { limit: 1 }, {
      actor: first, requestId: 'request-admin',
    })
    const events = await executeRegisteredTool('list_cms_events', { limit: 1 }, {
      actor: second, requestId: 'request-editor',
    })

    expect(news.ok).toBe(true)
    expect(events.ok).toBe(true)
    expect(auditRows).toMatchObject([
      { actor_id: 'admin-1', request_id: 'request-admin', tool_name: 'list_cms_news', status: 'ok' },
      { actor_id: 'editor-2', request_id: 'request-editor', tool_name: 'list_cms_events', status: 'ok' },
    ])
    expect(auditRows.every((entry) => !('access_token' in entry) && !('tool_arguments' in entry)))
      .toBe(true)
  })

  it('does not let one editor use another editor’s CMS permission', async () => {
    const editor = actor('editor-2', 'editor', ['admin.panel.editor'])
    currentGrants.set(editor.userId, new Set(editor.capabilities))

    const attempt = await executeRegisteredTool('list_cms_news', {}, {
      actor: editor, requestId: 'request-denied',
    })
    expect(attempt).toMatchObject({ ok: false, error_code: 'AI_TOOL_FORBIDDEN' })
    expect(auditRows).toMatchObject([
      { actor_id: 'editor-2', tool_name: 'list_cms_news', status: 'denied' },
    ])
  })

  it('re-checks live permissions when a role is revoked after the tools were listed', async () => {
    const editor = actor('editor-2', 'editor', ['cms.news.edit'])
    expect(listToolDefinitionsForActor(editor).map((tool) => tool.name))
      .toContain('list_cms_news')
    currentGrants.set(editor.userId, new Set<Capability>())

    const attempt = await executeRegisteredTool('list_cms_news', {}, {
      actor: editor, requestId: 'request-revoked',
    })
    expect(attempt).toMatchObject({ ok: false, error_code: 'AI_TOOL_FORBIDDEN' })
    expect(auditRows).toMatchObject([
      { actor_id: 'editor-2', tool_name: 'list_cms_news', status: 'denied' },
    ])
  })
})
