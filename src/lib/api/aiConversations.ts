import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import type { Database } from '@/types/database'
import type { AiAccessContext } from '@/lib/ai/auth/requireAiActor'
import type { AiToolCall } from '@/lib/ai/types/provider'

type Db = SupabaseClient<Database>
type ConversationRow = Database['public']['Tables']['ai_conversations']['Row']
type MessageRow = Database['public']['Tables']['ai_messages']['Row']

export interface AiConversation {
  id: string
  userId: string
  artistId: string | null
  accessContext: AiAccessContext
  title: string
  status: ConversationRow['status']
  activeRequestId: string | null
  activeRequestStartedAt: string | null
  cancelRequestedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AiMessageRecord {
  id: string
  conversationId: string
  role: MessageRow['role']
  content: string
  model: string | null
  tokenUsage: Record<string, unknown>
  status: MessageRow['status']
  toolCalls: AiToolCall[]
  toolCallId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AiConversationCursor {
  updatedAt: string
  id: string
}

export interface AiMessageCursor {
  createdAt: string
  id: string
}

const STALE_TURN_MS = 2 * 60 * 1000

export function rowToConversation(row: ConversationRow): AiConversation {
  return {
    id: row.id,
    userId: row.user_id,
    artistId: row.artist_id,
    accessContext: row.access_context,
    title: row.title,
    status: row.status,
    activeRequestId: row.active_request_id ?? null,
    activeRequestStartedAt: row.active_request_started_at ?? null,
    cancelRequestedAt: row.cancel_requested_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function rowToMessage(row: MessageRow): AiMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    model: row.model,
    tokenUsage: row.token_usage,
    status: row.status,
    toolCalls: parseToolCalls(row.tool_calls),
    toolCallId: row.tool_call_id ?? null,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function parseToolCalls(raw: unknown): AiToolCall[] {
  if (!Array.isArray(raw)) return []
  const calls: AiToolCall[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as { id?: unknown; name?: unknown; arguments?: unknown }
    if (typeof record.name !== 'string' || record.name.length === 0) continue
    calls.push({
      id: typeof record.id === 'string' ? record.id : '',
      name: record.name,
      arguments: typeof record.arguments === 'string' ? record.arguments : '{}',
    })
  }
  return calls
}

export function encodeConversationCursor(cursor: AiConversationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeConversationCursor(raw: string | null | undefined): AiConversationCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<AiConversationCursor>
    if (typeof parsed.updatedAt !== 'string' || typeof parsed.id !== 'string') return null
    if (!/^[0-9T:.Z+-]+$/.test(parsed.updatedAt) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) return null
    return { updatedAt: parsed.updatedAt, id: parsed.id }
  } catch {
    return null
  }
}

export function encodeMessageCursor(cursor: AiMessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeMessageCursor(raw: string | null | undefined): AiMessageCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<AiMessageCursor>
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    return null
  }
}

export async function createAiConversation(
  db: Db,
  input: {
    userId: string
    artistId: string | null
    accessContext: AiAccessContext
    title?: string
  },
): Promise<AiConversation> {
  const { data, error } = await db
    .from('ai_conversations')
    .insert({
      user_id: input.userId,
      artist_id: input.artistId,
      access_context: input.accessContext,
      title: (input.title ?? '').trim().slice(0, 120),
    })
    .select('*')
    .single()
  if (error) throw error
  return rowToConversation(data)
}

export async function listAiConversations(
  db: Db,
  input: {
    userId: string
    artistId: string | null
    accessContext: AiAccessContext
    cursor?: string | null
    limit?: number
  },
): Promise<{ items: AiConversation[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 100)
  let query = db
    .from('ai_conversations')
    .select('*')
    .eq('user_id', input.userId)
    .eq('access_context', input.accessContext)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (input.artistId) query = query.eq('artist_id', input.artistId)
  else query = query.is('artist_id', null)
  const cursor = decodeConversationCursor(input.cursor)
  if (cursor) {
    query = query.or(
      `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
    )
  }
  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  const last = slice[slice.length - 1]
  return {
    items: slice.map(rowToConversation),
    next_cursor:
      hasMore && last
        ? encodeConversationCursor({ updatedAt: last.updated_at, id: last.id })
        : null,
  }
}

export async function getAiConversationForUser(
  db: Db,
  conversationId: string,
  userId: string,
): Promise<AiConversation> {
  const { data, error } = await db
    .from('ai_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.user_id !== userId || data.status === 'deleted') {
    throw new ApiError(
      404,
      'That assistant conversation was not found or belongs to another account.',
      'AI_CONVERSATION_NOT_FOUND',
    )
  }
  return rowToConversation(data)
}

export function assertConversationContext(
  conversation: AiConversation,
  actor: { accessContext: AiAccessContext; artistId: string | null },
): void {
  if (
    conversation.accessContext !== actor.accessContext ||
    (conversation.artistId ?? null) !== (actor.artistId ?? null)
  ) {
    throw new ApiError(
      404,
      'That assistant conversation belongs to a different dashboard or artist context.',
      'AI_CONVERSATION_NOT_FOUND',
    )
  }
}

export async function renameAiConversation(
  db: Db,
  conversationId: string,
  userId: string,
  title: string,
): Promise<AiConversation> {
  await getAiConversationForUser(db, conversationId, userId)
  const clean = title.trim().slice(0, 120)
  const { data, error } = await db
    .from('ai_conversations')
    .update({ title: clean, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) throw error
  return rowToConversation(data)
}

export async function deleteAiConversation(db: Db, conversationId: string, userId: string): Promise<void> {
  await getAiConversationForUser(db, conversationId, userId)
  const { error } = await db
    .from('ai_conversations')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

/**
 * Loads the newest messages and returns them chronologically. Loading ascending
 * with a limit would hand the model the oldest 80 messages of a long chat.
 */
export async function listAiMessages(
  db: Db,
  conversationId: string,
  limit = 80,
): Promise<AiMessageRecord[]> {
  const capped = Math.min(Math.max(limit, 1), 200)
  const { data, error } = await db
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(capped)
  if (error) throw error
  return (data ?? []).map(rowToMessage).reverse()
}

/** Newest-first page for the conversation UI; the caller prepends older pages. */
export async function listAiMessagesPage(
  db: Db,
  conversationId: string,
  input: { before?: string | null; limit?: number } = {},
): Promise<{ items: AiMessageRecord[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 100)
  let query = db
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  const cursor = decodeMessageCursor(input.before)
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }
  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  const last = slice[slice.length - 1]
  return {
    items: slice.map(rowToMessage),
    next_cursor:
      hasMore && last
        ? encodeMessageCursor({ createdAt: last.created_at, id: last.id })
        : null,
  }
}

export async function insertAiMessage(
  db: Db,
  input: {
    conversationId: string
    role: MessageRow['role']
    content: string
    model?: string | null
    tokenUsage?: Record<string, unknown>
    status?: MessageRow['status']
    toolCalls?: AiToolCall[]
    toolCallId?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<AiMessageRecord> {
  const { data, error } = await db
    .from('ai_messages')
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
      token_usage: input.tokenUsage ?? {},
      status: input.status ?? 'complete',
      tool_calls: input.toolCalls ?? [],
      tool_call_id: input.toolCallId ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single()
  if (error) throw error
  await touchConversation(db, input.conversationId)
  if (input.role === 'user') {
    await maybeSetConversationTitle(db, input.conversationId, input.content)
  }
  return rowToMessage(data)
}

export async function updateAiMessage(
  db: Db,
  messageId: string,
  patch: {
    content?: string
    model?: string | null
    tokenUsage?: Record<string, unknown>
    status?: MessageRow['status']
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await db
    .from('ai_messages')
    .update({
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.tokenUsage !== undefined ? { token_usage: patch.tokenUsage } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
    })
    .eq('id', messageId)
  if (error) throw error
}

export async function claimAiConversationTurn(
  db: Db,
  conversationId: string,
  requestId: string,
  now = new Date(),
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STALE_TURN_MS).toISOString()
  const { data, error } = await db
    .from('ai_conversations')
    .update({
      active_request_id: requestId,
      active_request_started_at: now.toISOString(),
      cancel_requested_at: null,
      updated_at: now.toISOString(),
    })
    .eq('id', conversationId)
    .or(`active_request_id.is.null,active_request_started_at.lt.${staleBefore}`)
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

export async function releaseAiConversationTurn(
  db: Db,
  conversationId: string,
  requestId: string,
): Promise<void> {
  const { error } = await db
    .from('ai_conversations')
    .update({
      active_request_id: null,
      active_request_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('active_request_id', requestId)
  if (error) throw error
}

export async function requestAiConversationCancel(
  db: Db,
  conversationId: string,
  userId: string,
): Promise<void> {
  await getAiConversationForUser(db, conversationId, userId)
  const { error } = await db
    .from('ai_conversations')
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function isAiTurnCancelRequested(db: Db, conversationId: string): Promise<boolean> {
  const { data, error } = await db
    .from('ai_conversations')
    .select('cancel_requested_at')
    .eq('id', conversationId)
    .maybeSingle()
  if (error) return false
  return Boolean(data?.cancel_requested_at)
}

/** Recover turns whose serverless instance died while streaming. */
export async function markStaleAiTurnFailed(
  db: Db,
  conversation: AiConversation,
  now = new Date(),
): Promise<AiConversation> {
  if (!conversation.activeRequestStartedAt) return conversation
  const started = new Date(conversation.activeRequestStartedAt).getTime()
  if (Number.isFinite(started) && now.getTime() - started < STALE_TURN_MS) return conversation
  await db
    .from('ai_messages')
    .update({ status: 'failed' })
    .eq('conversation_id', conversation.id)
    .eq('status', 'streaming')
  await db
    .from('ai_conversations')
    .update({
      active_request_id: null,
      active_request_started_at: null,
      updated_at: now.toISOString(),
    })
    .eq('id', conversation.id)
    .eq('active_request_id', conversation.activeRequestId ?? '')
  return {
    ...conversation,
    activeRequestId: null,
    activeRequestStartedAt: null,
  }
}

async function touchConversation(db: Db, conversationId: string): Promise<void> {
  const { error } = await db
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
  if (error) throw error
}

async function maybeSetConversationTitle(
  db: Db,
  conversationId: string,
  content: string,
): Promise<void> {
  const title = content.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!title) return
  const { error } = await db
    .from('ai_conversations')
    .update({ title })
    .eq('id', conversationId)
    .eq('title', '')
  if (error) {
    // Title assignment is cosmetic; never fail a stored message for it.
    console.warn('[ai] conversation title update failed:', error.message)
  }
}
