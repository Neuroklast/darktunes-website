/**
 * src/lib/api/portalMessages.ts
 *
 * Data Access Layer for artist-to-artist / artist-to-label messaging
 * (portal_messages, portal_message_folders, portal_message_attachments).
 *
 * Works with both browser (RLS-enforced) and server (service-role) Supabase clients.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PortalMessage, PortalMessageFolder, PortalMessageAttachment } from '@/types'
import {
  resolveMessageListLimit,
  resolveMessageListOffset,
  type MessageListOptions,
  MESSAGE_LIST_DEFAULT_LIMIT,
  MESSAGE_SEARCH_DEFAULT_LIMIT,
  MESSAGE_ADMIN_INBOX_DEFAULT_LIMIT,
} from '@/lib/messaging/constants'
import {
  countUnreadPortalPeerForUser,
  upsertMessageReceipt,
} from '@/lib/messaging/receipts'
import { applyPortalMessageRulesOnInsert } from '@/lib/api/messageRules'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type MsgRow = Database['public']['Tables']['portal_messages']['Row']
type FolderRow = Database['public']['Tables']['portal_message_folders']['Row']
type AttachRow = Database['public']['Tables']['portal_message_attachments']['Row']

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToMessage(row: MsgRow): PortalMessage {
  return {
    id: row.id,
    fromArtistId: row.from_artist_id,
    toArtistId: row.to_artist_id,
    toLabel: row.to_label,
    subject: row.subject,
    body: row.body,
    bodyHtml: row.body_html,
    sentAt: row.sent_at,
    readAt: row.read_at,
    starred: row.starred,
    deletedAt: row.deleted_at,
    folderId: row.folder_id,
    hasAttachments: row.has_attachments,
    senderUserId: row.sender_user_id,
    clientMessageId: row.client_message_id,
    assigneeUserId: row.assignee_user_id,
    priority: row.priority,
    tags: row.tags ?? [],
  }
}

function rowToFolder(row: FolderRow): PortalMessageFolder {
  return {
    id: row.id,
    artistId: row.artist_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    position: row.position,
    createdAt: row.created_at,
  }
}

function rowToAttachment(row: AttachRow): PortalMessageAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Message queries
// ---------------------------------------------------------------------------

/** Messages received by an artist (to_artist_id = artistId, not deleted). */
export async function getInboxMessages(
  db: DbClient,
  artistId: string,
  folderId?: string | null,
  opts?: MessageListOptions,
): Promise<PortalMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_LIST_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)

  let query = db
    .from('portal_messages')
    .select('*')
    .eq('to_artist_id', artistId)
    .is('deleted_at', null)

  if (folderId !== undefined) {
    if (folderId === null) {
      query = query.is('folder_id', null)
    } else {
      query = query.eq('folder_id', folderId)
    }
  }

  const { data, error } = await query
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

/** Messages sent by an artist (from_artist_id = artistId, not deleted). */
export async function getSentMessages(
  db: DbClient,
  artistId: string,
  opts?: MessageListOptions,
): Promise<PortalMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_LIST_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)

  const { data, error } = await db
    .from('portal_messages')
    .select('*')
    .eq('from_artist_id', artistId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

/** Starred messages for an artist (sent or received, not deleted). */
export async function getStarredMessages(
  db: DbClient,
  artistId: string,
  opts?: MessageListOptions,
): Promise<PortalMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_LIST_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)

  const { data, error } = await db
    .from('portal_messages')
    .select('*')
    .or(`from_artist_id.eq.${artistId},to_artist_id.eq.${artistId}`)
    .eq('starred', true)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

/** Soft-deleted messages for an artist (trash view). */
export async function getTrashedMessages(
  db: DbClient,
  artistId: string,
  opts?: MessageListOptions,
): Promise<PortalMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_LIST_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)

  const { data, error } = await db
    .from('portal_messages')
    .select('*')
    .or(`from_artist_id.eq.${artistId},to_artist_id.eq.${artistId}`)
    .not('deleted_at', 'is', null)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

/** Messages sent to the label (to_label = true) by an artist. */
export async function getSentToLabelMessages(
  db: DbClient,
  artistId: string,
  opts?: MessageListOptions,
): Promise<PortalMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_LIST_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)

  const { data, error } = await db
    .from('portal_messages')
    .select('*')
    .eq('from_artist_id', artistId)
    .eq('to_label', true)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

/** Full text / keyword search across portal messages for an artist. */
export async function searchPortalMessages(
  db: DbClient,
  artistId: string,
  query: string,
  opts?: MessageListOptions,
): Promise<PortalMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_SEARCH_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)

  const { data, error } = await db
    .from('portal_messages')
    .select('*')
    .or(`from_artist_id.eq.${artistId},to_artist_id.eq.${artistId}`)
    .textSearch('search_vector', query.trim(), { type: 'websearch' })
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

/** Messages received from other artists (peer inbox, not label-originated). */
export async function getFromArtistMessages(
  db: DbClient,
  artistId: string,
  opts?: MessageListOptions,
): Promise<PortalMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_LIST_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)

  const { data, error } = await db
    .from('portal_messages')
    .select('*')
    .eq('to_artist_id', artistId)
    .eq('to_label', false)
    .not('from_artist_id', 'is', null)
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

/** Messages sent by artists to the label (admin inbox). */
export async function getIncomingToLabelMessages(
  db: DbClient,
  opts?: MessageListOptions & { organizationId?: string },
): Promise<PortalMessage[]> {
  const limit = resolveMessageListLimit(opts?.limit, MESSAGE_ADMIN_INBOX_DEFAULT_LIMIT)
  const offset = resolveMessageListOffset(opts?.offset)
  const organizationId = opts?.organizationId ?? DEFAULT_ORGANIZATION_ID

  const artistIds = await artistIdsForOrganization(db, organizationId)
  if (artistIds && artistIds.length === 0) return []

  let query = db
    .from('portal_messages')
    .select('*')
    .eq('to_label', true)
    .is('deleted_at', null)
  if (artistIds) {
    query = query.in('from_artist_id', artistIds)
  }
  const { data, error } = await query
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToMessage)
}

/** Unread count for artist-to-label messages (admin inbox). */
export async function getIncomingToLabelUnreadCount(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<number> {
  const artistIds = await artistIdsForOrganization(db, organizationId)
  if (artistIds && artistIds.length === 0) return 0

  let query = db
    .from('portal_messages')
    .select('id', { count: 'exact', head: true })
    .eq('to_label', true)
    .is('read_at', null)
    .is('deleted_at', null)
  if (artistIds) {
    query = query.in('from_artist_id', artistIds)
  }
  const { count, error } = await query

  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Unread count for an artist's peer inbox (portal_messages). */
export async function getPortalPeerUnreadCount(
  db: DbClient,
  artistId: string,
  userId?: string | null,
): Promise<number> {
  return countUnreadPortalPeerForUser(db, artistId, userId)
}

/** @deprecated Use getSentToLabelMessages */
export const getLabelMessages = getSentToLabelMessages

// ---------------------------------------------------------------------------
// Message mutations
// ---------------------------------------------------------------------------

export interface SendMessageOpts {
  fromArtistId: string
  toArtistId?: string | null
  toLabel?: boolean
  subject: string
  body: string
  bodyHtml?: string | null
  senderUserId?: string | null
  clientMessageId?: string | null
}

/** Sends a new portal message. Returns the created message. */
export async function sendPortalMessage(
  db: DbClient,
  opts: SendMessageOpts,
): Promise<PortalMessage> {
  const { data, error } = await db
    .from('portal_messages')
    .insert({
      from_artist_id: opts.fromArtistId,
      to_artist_id: opts.toArtistId ?? null,
      to_label: opts.toLabel ?? false,
      subject: opts.subject,
      body: opts.body,
      body_html: opts.bodyHtml ?? null,
      sender_user_id: opts.senderUserId ?? null,
      client_message_id: opts.clientMessageId ?? null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505' && opts.clientMessageId) {
      const { data: existing } = await db
        .from('portal_messages')
        .select('*')
        .eq('client_message_id', opts.clientMessageId)
        .maybeSingle()
      if (existing) return rowToMessage(existing)
    }
    throw new Error(error.message)
  }
  const message = rowToMessage(data)

  try {
    await applyPortalMessageRulesOnInsert(db, {
      id: message.id,
      fromArtistId: message.fromArtistId,
      subject: message.subject,
      body: message.body,
      toLabel: message.toLabel,
    })
  } catch (err) {
    console.error('[sendPortalMessage] rule apply failed:', err)
  }

  return message
}

/** Marks a received message as read. */
export async function markPortalMessageRead(
  db: DbClient,
  messageId: string,
  userId?: string | null,
): Promise<void> {
  const { error } = await db
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null)

  if (error) throw new Error(error.message)

  if (userId) {
    try {
      await upsertMessageReceipt(db, { source: 'portal', messageId, userId })
    } catch (err) {
      console.error('[markPortalMessageRead] receipt upsert failed:', err)
    }
  }
}

/** Toggles the starred flag on a message. */
export async function togglePortalMessageStar(
  db: DbClient,
  messageId: string,
  starred: boolean,
): Promise<void> {
  const { error } = await db
    .from('portal_messages')
    .update({ starred })
    .eq('id', messageId)

  if (error) throw new Error(error.message)
}

/** Soft-deletes a message (moves it to trash). */
export async function softDeletePortalMessage(db: DbClient, messageId: string): Promise<void> {
  const { error } = await db
    .from('portal_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)

  if (error) throw new Error(error.message)
}

/** Restores a soft-deleted message. */
export async function restorePortalMessage(db: DbClient, messageId: string): Promise<void> {
  const { error } = await db
    .from('portal_messages')
    .update({ deleted_at: null })
    .eq('id', messageId)

  if (error) throw new Error(error.message)
}

/** Moves a message to a folder (null = Inbox). */
export async function movePortalMessage(
  db: DbClient,
  messageId: string,
  folderId: string | null,
): Promise<void> {
  const { error } = await db
    .from('portal_messages')
    .update({ folder_id: folderId })
    .eq('id', messageId)

  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Folder operations
// ---------------------------------------------------------------------------

export async function getPortalFolders(
  db: DbClient,
  artistId: string,
): Promise<PortalMessageFolder[]> {
  const { data, error } = await db
    .from('portal_message_folders')
    .select('*')
    .eq('artist_id', artistId)
    .order('position', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToFolder)
}

export async function createPortalFolder(
  db: DbClient,
  artistId: string,
  name: string,
  color?: string,
  icon?: string,
): Promise<PortalMessageFolder> {
  const { data: existing } = await db
    .from('portal_message_folders')
    .select('position')
    .eq('artist_id', artistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (existing?.position ?? -1) + 1

  const { data, error } = await db
    .from('portal_message_folders')
    .insert({ artist_id: artistId, name, color: color ?? null, icon: icon ?? null, position })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToFolder(data)
}

export async function updatePortalFolder(
  db: DbClient,
  folderId: string,
  updates: { name?: string; color?: string | null; icon?: string | null },
): Promise<void> {
  const { error } = await db
    .from('portal_message_folders')
    .update(updates)
    .eq('id', folderId)

  if (error) throw new Error(error.message)
}

export async function deletePortalFolder(db: DbClient, folderId: string): Promise<void> {
  // Move messages in this folder back to inbox first
  await db
    .from('portal_messages')
    .update({ folder_id: null })
    .eq('folder_id', folderId)

  const { error } = await db.from('portal_message_folders').delete().eq('id', folderId)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Attachment queries
// ---------------------------------------------------------------------------

export async function getPortalAttachments(
  db: DbClient,
  messageId: string,
): Promise<PortalMessageAttachment[]> {
  const { data, error } = await db
    .from('portal_message_attachments')
    .select('*')
    .eq('message_id', messageId)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAttachment)
}
