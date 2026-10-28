/**
 * Validated, atomic CMS approval handoff.
 *
 * Never consume the one-time token in JavaScript before applying the CMS edit.
 * The database RPC locks the approval, writes the CMS row + audit entry, and
 * persists the idempotent result within one PostgreSQL transaction.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'
import type { AiWriteAction } from '@/lib/ai/actions/confirmations'
import { canonicalJson } from '@/lib/ai/actions/confirmations'
import { ApiError } from '@/lib/errors'
import { contentChangePayload, contentCapability } from '@/lib/mcp/contentMutations'
import { mcpNewsDraftSchema } from '@/lib/ai/tools/mcpWrites'

const tokenPattern = /^act_[a-f0-9]{48}$/
const rpcResult = z.object({
  ok: z.literal(true),
  detail: z.string(),
  location: z.string(),
  entity_id: z.string().uuid(),
  replayed: z.boolean(),
})

export const mcpActions = [
  'create_cms_news_draft', 'update_cms_artist',
  'update_cms_release', 'update_cms_event',
] as const
export type McpAction = (typeof mcpActions)[number]

export function isMcpAction(action: AiWriteAction): action is McpAction {
  return mcpActions.some(value => value === action)
}

export async function commitMcpApproval(
  actor: AiActor,
  token: string,
  action: McpAction,
): Promise<z.infer<typeof rpcResult>> {
  if (!tokenPattern.test(token)) {
    throw new ApiError(400, 'This approval token is malformed.', 'VALIDATION_ERROR')
  }
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: pending, error: lookupError } = await actor.serviceDb
    .from('ai_action_confirmations')
    .select('user_id,artist_id,action,payload_hash,payload,expires_at,used_at,result')
    .eq('token_hash', tokenHash).maybeSingle()
  if (lookupError) throw lookupError
  if (!pending || pending.user_id !== actor.userId ||
      pending.artist_id !== null || pending.action !== action) {
    throw new ApiError(404, 'Approval not found for this account.', 'NOT_FOUND')
  }
  if (pending.used_at && pending.result === null) {
    throw new ApiError(409, 'Approval was previously used without a saved result.', 'CONFLICT')
  }
  if (!pending.used_at && new Date(pending.expires_at).getTime() <= Date.now()) {
    throw new ApiError(410, 'The approval expired. Prepare the change again.', 'AI_CONFIRMATION_EXPIRED')
  }
  if (createHash('sha256').update(canonicalJson(pending.payload)).digest('hex') !== pending.payload_hash) {
    throw new ApiError(409, 'The approval content changed after preparation.', 'CONFLICT')
  }
  if (action === 'create_cms_news_draft') {
    if (!actor.capabilities.has('cms.news.edit') || !mcpNewsDraftSchema.safeParse(pending.payload).success) {
      throw new ApiError(403, 'The news draft is invalid or not permitted.', 'FORBIDDEN')
    }
  } else {
    const parsed = contentChangePayload.safeParse(pending.payload)
    const expectedKind = action === 'update_cms_artist' ? 'artist'
      : action === 'update_cms_release' ? 'release' : 'event'
    if (!parsed.success || parsed.data.kind !== expectedKind ||
        !actor.capabilities.has(contentCapability[expectedKind])) {
      throw new ApiError(403, 'The CMS change is invalid or not permitted.', 'FORBIDDEN')
    }
  }
  if (actor.role !== 'editor' && actor.role !== 'admin') {
    throw new ApiError(403, 'An editor or administrator must approve this change.', 'FORBIDDEN')
  }

  const { data, error } = await actor.serviceDb.rpc('commit_mcp_approval', {
    p_token_hash: tokenHash,
    p_actor_id: actor.userId,
    p_action: action,
    p_payload_hash: pending.payload_hash,
  })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new ApiError(503,
        'The atomic CMS approval function is not deployed. Apply the reviewed reset.sql function first.',
        'MCP_DATABASE_NOT_READY')
    }
    throw new ApiError(409,
      'The CMS update was not applied. The record may have changed, or the approval is invalid.',
      'CONFLICT')
  }
  const parsed = rpcResult.safeParse(data)
  if (!parsed.success) {
    throw new ApiError(500, 'The approval returned an invalid database result.', 'MCP_INVALID_RESULT')
  }
  return parsed.data
}
