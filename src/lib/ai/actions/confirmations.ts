import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import type { Database } from '@/types/database'
import type { AiActor } from '@/lib/ai/auth/requireAiActor'

type Db = SupabaseClient<Database>

export type AiWriteAction =
  | 'save_epk_text'
  | 'save_profile_update'
  | 'save_release_draft'
  | 'create_support_ticket'
  | 'save_error_report'
  | 'create_cms_news_draft'
  | 'update_cms_artist'
  | 'update_cms_release'
  | 'update_cms_event'

export interface ActionPreview {
  action: AiWriteAction
  confirmation_token: string
  expires_at: string
  summary: string
  payload: Record<string, unknown>
}

const TTL_MS = 10 * 60 * 1000

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * JSONB is order-insensitive for object keys. Hash ALL nested properties
 * canonically so changes to nested "changes" or "before" cannot go undetected.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return '{' + keys.filter(key => record[key] !== undefined).map(key =>
      JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

export async function createActionConfirmation(
  db: Db,
  input: {
    actor: AiActor
    action: AiWriteAction
    payload: Record<string, unknown>
    summary: string
  },
): Promise<ActionPreview> {
  const token = `act_${randomBytes(24).toString('hex')}`
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  const { error } = await db.from('ai_action_confirmations').insert({
    token_hash: sha256(token),
    user_id: input.actor.userId,
    artist_id: input.actor.artistId,
    action: input.action,
    payload_hash: sha256(canonicalJson(input.payload)),
    payload: input.payload,
    expires_at: expiresAt,
  })
  if (error) throw error
  return {
    action: input.action,
    confirmation_token: token,
    expires_at: expiresAt,
    summary: input.summary,
    payload: input.payload,
  }
}

export async function consumeActionConfirmation(
  db: Db,
  input: { actor: AiActor; token: string; action: AiWriteAction },
): Promise<Record<string, unknown>> {
  const tokenHash = sha256(input.token)
  const { data, error } = await db
    .from('ai_action_confirmations')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!data || data.user_id !== input.actor.userId) {
    throw new ApiError(404, 'That confirmation was not found or belongs to another account.', 'NOT_FOUND')
  }
  if (data.action !== input.action) {
    throw new ApiError(409, 'This confirmation is for a different action.', 'CONFLICT')
  }
  if (data.used_at) {
    throw new ApiError(409, 'This confirmation was already used.', 'CONFLICT')
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new ApiError(410, 'The confirmation for this assistant action expired. Ask the assistant to prepare it again.', 'AI_CONFIRMATION_EXPIRED')
  }
  const artistOk =
    (data.artist_id ?? null) === (input.actor.artistId ?? null) ||
    (input.actor.accessContext !== 'artist' && data.artist_id === null)
  if (!artistOk) {
    throw new ApiError(403, 'That assistant action is not allowed for this account.', 'AI_TOOL_FORBIDDEN')
  }
  const payload = (data.payload ?? {}) as Record<string, unknown>
  if (sha256(canonicalJson(payload)) !== data.payload_hash) {
    throw new ApiError(409, 'The confirmation payload no longer matches.', 'CONFLICT')
  }
  const { data: updated, error: usedError } = await db
    .from('ai_action_confirmations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('used_at', null)
    .select('id')
  if (usedError) throw usedError
  if (!updated?.length) {
    throw new ApiError(409, 'This confirmation was already used.', 'CONFLICT')
  }
  return payload
}
