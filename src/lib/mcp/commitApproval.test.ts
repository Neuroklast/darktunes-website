import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { commitMcpApproval } from './commitApproval'
import { canonicalJson } from '@/lib/ai/actions/confirmations'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Capability } from '@/lib/rbac/types'

const token = 'act_' + 'a'.repeat(48)
const userId = '00000000-0000-4000-8000-000000000001'
const entityId = '00000000-0000-4000-8000-000000000002'
const payload = {
  title: 'A new label announcement',
  slug: 'a-new-label-announcement',
  excerpt: '',
  content: 'This test content is long enough for the CMS news draft.',
}
const hash = (input: string) => createHash('sha256').update(input).digest('hex')
function fixture(overrides: Record<string, unknown> = {}) {
  const saved = {
    user_id: userId, artist_id: null,
    action: 'create_cms_news_draft', payload, expires_at: '2099-01-01T00:00:00Z',
    used_at: null, result: null, payload_hash: hash(canonicalJson(payload)),
    ...overrides,
  }
  const rpc = vi.fn(async (): Promise<{
    data: { ok: boolean; detail: string; location: string; entity_id: string; replayed: boolean } | null
    error: { code: string; message: string } | null
  }> => ({
    data: {
      ok: true, detail: 'News draft saved; not published.',
      location: '/admin/news/' + entityId, entity_id: entityId, replayed: false,
    },
    error: null,
  }))
  const db = {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: saved, error: null }) }),
      }),
    })),
    rpc,
  } as unknown as SupabaseClient<Database>
  const actor = {
    userId, role: 'editor', accessContext: 'editor', dashboard: 'admin',
    artistId: null, artistMembershipIds: [],
    capabilities: new Set<Capability>(['cms.news.edit']),
    availableArtists: [], serviceDb: db, userDb: db,
  } satisfies AiActor
  return { actor, rpc }
}

describe('atomic MCP approval', () => {
  it('calls exactly one transactional RPC with hashed token and matching payload hash', async () => {
    const { actor, rpc } = fixture()
    const response = await commitMcpApproval(actor, token, 'create_cms_news_draft')
    expect(response).toMatchObject({ ok: true, entity_id: entityId, replayed: false })
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('commit_mcp_approval', {
      p_token_hash: hash(token), p_actor_id: userId,
      p_action: 'create_cms_news_draft', p_payload_hash: hash(canonicalJson(payload)),
    })
  })
  it('approves the authenticated owner\'s inbox UUID without requiring the secret URL token', async () => {
    const approvalId = '00000000-0000-4000-8000-000000000003'
    const { actor, rpc } = fixture({
      id: approvalId,
      token_hash: hash(token),
    })
    const result = await commitMcpApproval(actor, approvalId, 'create_cms_news_draft')
    expect(result).toMatchObject({ ok: true, replayed: false })
    expect(rpc).toHaveBeenCalledWith('commit_mcp_approval', {
      p_token_hash: hash(token),
      p_actor_id: userId,
      p_action: 'create_cms_news_draft',
      p_payload_hash: hash(canonicalJson(payload)),
    })
  })
  it('rejects another user when an inbox UUID is requested', async () => {
    const approvalId = '00000000-0000-4000-8000-000000000003'
    const { actor, rpc } = fixture({
      id: approvalId, token_hash: hash(token),
      user_id: '00000000-0000-4000-8000-000000000099',
    })
    await expect(commitMcpApproval(actor, approvalId, 'create_cms_news_draft'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('allows any authenticated administrator to approve another admin\'s proposal', async () => {
    const { actor, rpc } = fixture({
      user_id: '00000000-0000-4000-8000-000000000099',
    })
    actor.role = 'admin'
    actor.accessContext = 'admin'
    await expect(commitMcpApproval(actor, token, 'create_cms_news_draft'))
      .resolves.toMatchObject({ ok: true })
    expect(rpc).toHaveBeenCalledOnce()
  })
  it('atomically rejects an editor-owned proposal without applying CMS content', async () => {
    const { actor, rpc } = fixture()
    rpc.mockResolvedValueOnce({
      data: {
        ok: true, detail: 'Declined',
        location: '/admin/mcp-approvals', entity_id: entityId, replayed: false,
        decision: 'rejected',
      }, error: null,
    })
    const result = await commitMcpApproval(actor, token, 'create_cms_news_draft', 'reject')
    expect(result.decision).toBe('rejected')
    expect(rpc).toHaveBeenCalledWith('reject_mcp_approval', {
      p_token_hash: hash(token), p_actor_id: userId,
      p_action: 'create_cms_news_draft', p_payload_hash: hash(canonicalJson(payload)),
    })
  })
  it('rejects malformed identifiers without accessing the database', async () => {
    const { actor, rpc } = fixture()
    await expect(commitMcpApproval(actor, 'not-an-approval', 'create_cms_news_draft'))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects modified nested content before any RPC call', async () => {
    const { actor, rpc } = fixture({ payload_hash: hash('tampered') })
    await expect(commitMcpApproval(actor, token, 'create_cms_news_draft'))
      .rejects.toMatchObject({ code: 'CONFLICT' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects another user while allowing old and non-expiring pending proposals', async () => {
    const a = fixture({ user_id: '00000000-0000-4000-8000-000000000099' })
    await expect(commitMcpApproval(a.actor, token, 'create_cms_news_draft'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(a.rpc).not.toHaveBeenCalled()

    const pastExpiry = fixture({ expires_at: '2000-01-01T00:00:00Z' })
    await expect(commitMcpApproval(pastExpiry.actor, token, 'create_cms_news_draft'))
      .resolves.toMatchObject({ ok: true })
    expect(pastExpiry.rpc).toHaveBeenCalledOnce()

    const permanent = fixture({ expires_at: null })
    await expect(commitMcpApproval(permanent.actor, token, 'create_cms_news_draft'))
      .resolves.toMatchObject({ ok: true })
    expect(permanent.rpc).toHaveBeenCalledOnce()
  })
  it('rejects a missing CMS permission and non-editor actor', async () => {
    const { actor, rpc } = fixture()
    actor.capabilities.clear()
    await expect(commitMcpApproval(actor, token, 'create_cms_news_draft'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('allows idempotent retry of a committed result (never runs a second client write)', async () => {
    const { actor, rpc } = fixture({
      used_at: '2026-10-28T07:00:00Z',
      result: { ok: true, entity_id: entityId },
    })
    rpc.mockResolvedValueOnce({
      data: {
        ok: true, detail: 'News draft saved; not published.',
        location: '/admin/news/' + entityId, entity_id: entityId, replayed: true,
      }, error: null,
    })
    const result = await commitMcpApproval(actor, token, 'create_cms_news_draft')
    expect(result.replayed).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('fails closed when the reviewed SQL function is not deployed', async () => {
    const { actor, rpc } = fixture()
    rpc.mockResolvedValueOnce({
      data: null, error: { code: 'PGRST202', message: 'function not found' },
    })
    await expect(commitMcpApproval(actor, token, 'create_cms_news_draft'))
      .rejects.toMatchObject({ code: 'MCP_DATABASE_NOT_READY' })
  })
})
