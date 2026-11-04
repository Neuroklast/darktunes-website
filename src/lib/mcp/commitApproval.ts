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
const approvalIdPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
const rpcResult = z.object({
  ok: z.literal(true),
  detail: z.string(),
  location: z.string(),
  entity_id: z.string().uuid(),
  replayed: z.boolean(),
  decision: z.enum(['approved', 'rejected']).optional(),
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
  decision: 'approve' | 'reject' = 'approve',
): Promise<z.infer<typeof rpcResult>> {
  const isToken = tokenPattern.test(token)
  if (!isToken && !approvalIdPattern.test(token)) {
    throw new ApiError(400, 'This approval identifier is malformed.', 'VALIDATION_ERROR')
  }
  const tokenHash = isToken ? createHash('sha256').update(token).digest('hex') : null
  const lookup = actor.serviceDb.from('ai_action_confirmations')
    .select('id,token_hash,user_id,artist_id,action,payload_hash,payload,expires_at,used_at,result')
  const { data: pending, error: lookupError } = await (
    isToken ? lookup.eq('token_hash', tokenHash!) : lookup.eq('id', token)
  ).maybeSingle()
  if (lookupError) throw lookupError
  if (!pending || (pending.user_id !== actor.userId && actor.role !== 'admin') ||
      pending.artist_id !== null || pending.action !== action) {
    throw new ApiError(404, 'Approval not found for this account.', 'NOT_FOUND')
  }
  if (pending.used_at && pending.result === null) {
    throw new ApiError(409, 'Approval was previously used without a saved result.', 'CONFLICT')
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

  const approvalHash = tokenHash ?? pending.token_hash
  if (!/^[0-9a-f]{64}$/.test(approvalHash)) {
    throw new ApiError(409, 'The stored approval identifier is invalid.', 'CONFLICT')
  }
  const { data, error } = await actor.serviceDb.rpc(
    decision === 'approve' ? 'commit_mcp_approval' : 'reject_mcp_approval', {
    p_token_hash: approvalHash,
    p_actor_id: actor.userId,
    p_action: action,
    p_payload_hash: pending.payload_hash,
  })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new ApiError(503,
        'The atomic GPT review function is not deployed. Apply the reviewed reset.sql function first.',
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
  // A completed approval no longer needs to appear unread in the existing bell.
  if (pending.id) {
    try {
      await actor.serviceDb.from('notifications')
        .update({ read: true })
        .eq('entity_id', pending.id)
        .eq('type', 'mcp_approval_pending')
    } catch {
      // Notification bookkeeping must not turn a committed edit into an error.
    }
  }
  return parsed.data
}
