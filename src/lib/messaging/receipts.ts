/**
 * Per-user message read receipts (label + portal sources).
 * Shared message-level `read` flags remain for backward compatibility;
 * multi-member unread counts should use receipts when userId is known.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export type MessageReceiptSource = 'label' | 'portal'

export async function upsertMessageReceipt(
  db: DbClient,
  opts: { source: MessageReceiptSource; messageId: string; userId: string },
): Promise<void> {
  const { error } = await db.from('message_receipts').upsert(
    {
      message_source: opts.source,
      message_id: opts.messageId,
      user_id: opts.userId,
      read_at: new Date().toISOString(),
    },
    { onConflict: 'message_source,message_id,user_id' },
  )
  if (error) throw new Error(error.message)
}

/** Bulk-mark messages as read for one user (badge counts use receipts, not only legacy flags). */
export async function upsertMessageReceipts(
  db: DbClient,
  opts: { source: MessageReceiptSource; messageIds: string[]; userId: string },
): Promise<void> {
  if (opts.messageIds.length === 0) return
  const readAt = new Date().toISOString()
  const rows = opts.messageIds.map((messageId) => ({
    message_source: opts.source,
    message_id: messageId,
    user_id: opts.userId,
    read_at: readAt,
  }))
  // Chunk to stay under PostgREST payload limits
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await db
      .from('message_receipts')
      .upsert(slice, { onConflict: 'message_source,message_id,user_id' })
    if (error) throw new Error(error.message)
  }
}

export async function listReadMessageIds(
  db: DbClient,
  opts: { source: MessageReceiptSource; userId: string; messageIds: string[] },
): Promise<Set<string>> {
  if (opts.messageIds.length === 0) return new Set()

  const { data, error } = await db
    .from('message_receipts')
    .select('message_id')
    .eq('message_source', opts.source)
    .eq('user_id', opts.userId)
    .in('message_id', opts.messageIds)

  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((row) => row.message_id))
}

/**
 * Count label messages for an artist that the user has not receipted.
 * Falls back to message.read = false when userId is omitted.
 */
export async function countUnreadLabelMessagesForUser(
  db: DbClient,
  artistId: string,
  userId: string | null | undefined,
): Promise<number> {
  if (!userId) {
    const { count, error } = await db
      .from('label_messages')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('read', false)
      .is('deleted_at', null)
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  // Fetch recent unread-by-legacy flag ids then subtract receipts (bounded for cost)
  const { data, error } = await db
    .from('label_messages')
    .select('id')
    .eq('artist_id', artistId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length === 0) return 0

  const readIds = await listReadMessageIds(db, {
    source: 'label',
    userId,
    messageIds: ids,
  })
  return ids.filter((id) => !readIds.has(id)).length
}

export async function countUnreadPortalPeerForUser(
  db: DbClient,
  artistId: string,
  userId: string | null | undefined,
): Promise<number> {
  if (!userId) {
    const { count, error } = await db
      .from('portal_messages')
      .select('id', { count: 'exact', head: true })
      .eq('to_artist_id', artistId)
      .is('read_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  const { data, error } = await db
    .from('portal_messages')
    .select('id')
    .eq('to_artist_id', artistId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length === 0) return 0

  const readIds = await listReadMessageIds(db, {
    source: 'portal',
    userId,
    messageIds: ids,
  })
  return ids.filter((id) => !readIds.has(id)).length
}
