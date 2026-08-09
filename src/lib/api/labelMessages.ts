import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { LabelMessage, MessageTemplate } from '@/types'
import {
  resolveMessageListLimit,
  resolveMessageListOffset,
  type MessageListOptions,
  MESSAGE_ADMIN_INBOX_DEFAULT_LIMIT,
  MESSAGE_LIST_DEFAULT_LIMIT,
  MESSAGE_SEARCH_DEFAULT_LIMIT,
} from '@/lib/messaging/constants'
import { upsertMessageReceipt, countUnreadLabelMessagesForUser } from '@/lib/messaging/receipts'
import { applyMessageRulesOnInsert } from '@/lib/api/messageRules'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type MessageRow = Database['public']['Tables']['label_messages']['Row']
type MessageInsert = Database['public']['Tables']['label_messages']['Insert']
type TemplateRow = Database['public']['Tables']['message_templates']['Row']
type TemplateInsert = Database['public']['Tables']['message_templates']['Insert']

function rowToMessage(row: MessageRow): LabelMessage {
  return {
    id: row.id,
    artistId: row.artist_id,
    subject: row.subject,
    body: row.body,
    bodyHtml: row.body_html,
    read: row.read,
    readAt: row.read_at,
    starred: row.starred,
    deletedAt: row.deleted_at,
    sentAt: row.sent_at,
    folderId: row.folder_id,
    senderEmail: row.sender_email,
    isExternal: row.is_external,
    forwardedFrom: row.forwarded_from,
    hasAttachments: row.has_attachments,
    senderUserId: row.sender_user_id,
    clientMessageId: row.client_message_id,
  }
}

function rowToTemplate(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.body_html,
    createdAt: row.created_at,
  }
}

export async function getLabelUnreadCount(
  db: DbClient,
  artistId: string,
  userId?: string | null,
): Promise<number> {
  return countUnreadLabelMessagesForUser(db, artistId, userId)
}

export async function getLabelMessages(
  db: DbClient,
  artistId: string,
  opts?: MessageListOptions,
): Promise<LabelMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_LIST_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)

  const { data, error } = await db
    .from('label_messages')
    .select('*')
    .eq('artist_id', artistId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

async function artistIdsForOrganization(
  db: DbClient,
  organizationId: string,
): Promise<string[] | null> {
  // null = unscoped (fallback when organization_id column missing)
  try {
    const { data, error } = await db
      .from('artists')
      .select('id')
      .eq('organization_id', organizationId)
    if (error) return null
    return (data ?? []).map((r) => r.id)
  } catch {
    return null
  }
}

export async function getAllLabelMessages(
  db: DbClient,
  opts?: MessageListOptions & { organizationId?: string },
): Promise<LabelMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_ADMIN_INBOX_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)
  const organizationId = opts?.organizationId ?? DEFAULT_ORGANIZATION_ID

  const artistIds = await artistIdsForOrganization(db, organizationId)
  if (artistIds && artistIds.length === 0) return []

  let query = db.from('label_messages').select('*')
  if (artistIds) {
    query = query.in('artist_id', artistIds)
  }
  const { data, error } = await query
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

export async function searchLabelMessages(
  db: DbClient,
  query: string,
  filters?: {
    artistId?: string
    unreadOnly?: boolean
    organizationId?: string
  } & MessageListOptions,
): Promise<LabelMessage[]> {
  const limit = resolveMessageListLimit(filters?.limit, MESSAGE_SEARCH_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(filters?.offset)
  const organizationId = filters?.organizationId ?? DEFAULT_ORGANIZATION_ID

  let builder = db.from('label_messages').select('*').is('deleted_at', null)
  if (query.trim()) {
    builder = builder.textSearch('search_vector', query.trim(), { type: 'websearch' })
  }
  if (filters?.artistId) {
    builder = builder.eq('artist_id', filters.artistId)
  } else {
    const artistIds = await artistIdsForOrganization(db, organizationId)
    if (artistIds && artistIds.length === 0) return []
    if (artistIds) {
      builder = builder.in('artist_id', artistIds)
    }
  }
  if (filters?.unreadOnly) {
    builder = builder.eq('read', false)
  }
  const { data, error } = await builder
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

export async function sendMessage(
  db: DbClient,
  artistId: string,
  subject: string,
  body: string,
  bodyHtml?: string,
  opts?: { senderUserId?: string | null; clientMessageId?: string | null },
): Promise<LabelMessage> {
  const payload: MessageInsert = {
    artist_id: artistId,
    subject,
    body,
    body_html: bodyHtml ?? null,
    sender_user_id: opts?.senderUserId ?? null,
    client_message_id: opts?.clientMessageId ?? null,
  }
  const { data, error } = await db.from('label_messages').insert(payload).select().single()
  if (error) {
    // Unique client_message_id — return existing
    if (error.code === '23505' && opts?.clientMessageId) {
      const { data: existing } = await db
        .from('label_messages')
        .select('*')
        .eq('client_message_id', opts.clientMessageId)
        .maybeSingle()
      if (existing) return rowToMessage(existing)
    }
    throw new Error(error.message)
  }
  if (!data) throw new Error('No data returned from sendMessage')
  const message = rowToMessage(data)

  try {
    await applyMessageRulesOnInsert(db, message)
  } catch (err) {
    console.error('[sendMessage] rule apply failed:', err)
  }

  return message
}

export async function markMessageRead(
  db: DbClient,
  id: string,
  userId?: string | null,
): Promise<LabelMessage> {
  const { data, error } = await db
    .from('label_messages')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from markMessageRead')

  if (userId) {
    try {
      await upsertMessageReceipt(db, { source: 'label', messageId: id, userId })
    } catch (err) {
      console.error('[markMessageRead] receipt upsert failed:', err)
    }
  }

  return rowToMessage(data)
}

export async function starMessage(db: DbClient, id: string, starred: boolean): Promise<LabelMessage> {
  const { data, error } = await db
    .from('label_messages')
    .update({ starred })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from starMessage')
  return rowToMessage(data)
}

export async function softDeleteMessage(db: DbClient, id: string): Promise<void> {
  const { error } = await db
    .from('label_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function hardDeleteMessages(db: DbClient, ids: string[]): Promise<void> {
  const { error } = await db.from('label_messages').delete().in('id', ids)
  if (error) throw new Error(error.message)
}

export async function getMessageTemplates(db: DbClient): Promise<MessageTemplate[]> {
  const { data, error } = await db.from('message_templates').select('*').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToTemplate)
}

export async function saveMessageTemplate(
  db: DbClient,
  name: string,
  subject: string,
  bodyHtml: string,
): Promise<MessageTemplate> {
  const payload: TemplateInsert = { name, subject, body_html: bodyHtml }
  const { data, error } = await db.from('message_templates').insert(payload).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from saveMessageTemplate')
  return rowToTemplate(data)
}

export async function deleteMessageTemplate(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('message_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
