import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { markMessageRead } from '@/lib/api/labelMessages'
import { markPortalMessageRead } from '@/lib/api/portalMessages'
import { markNotificationRead } from '@/lib/api/notifications'
import { getNotificationHref } from '@/lib/notifications'
import {
  listReadMessageIds,
  upsertMessageReceipts,
} from '@/lib/messaging/receipts'

type DbClient = SupabaseClient<Database>

export type PortalNotificationKind =
  | 'label_message'
  | 'portal_message'
  | 'interview'
  | 'statement'
  | 'platform'

export interface PortalNotificationItem {
  id: string
  kind: PortalNotificationKind
  title: string
  href: string
  createdAt: string
  isUnread: boolean
  canMarkRead: boolean
  /** Present for kind === 'platform' */
  platformType?: string
}

function buildPortalHref(path: string, artistId: string): string {
  return `${path}?artistId=${artistId}`
}

/**
 * Aggregated bell feed. When `userId` is set, message unread state follows
 * per-user `message_receipts` (same as badge counts). Without userId, falls
 * back to legacy message-level `read` / `read_at`.
 */
export async function getPortalNotificationFeed(
  db: DbClient,
  artistId: string,
  limit = 20,
  userId?: string | null,
): Promise<PortalNotificationItem[]> {
  const [labelResult, portalResult, interviewResult, statementResult, platformResult] =
    await Promise.all([
      db
        .from('label_messages')
        .select('id, subject, sent_at, read')
        .eq('artist_id', artistId)
        .is('deleted_at', null)
        .order('sent_at', { ascending: false })
        .limit(limit),
      db
        .from('portal_messages')
        .select('id, subject, sent_at, read_at')
        .eq('to_artist_id', artistId)
        .is('deleted_at', null)
        .order('sent_at', { ascending: false })
        .limit(limit),
      db
        .from('interview_requests')
        .select('id, subject, created_at, status')
        .eq('artist_id', artistId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(limit),
      db
        .from('sales_statements')
        .select('id, period, filename, created_at, status')
        .eq('artist_id', artistId)
        .eq('status', 'artist_notified')
        .order('created_at', { ascending: false })
        .limit(limit),
      // RLS scopes to auth.uid(); artist_id filters multi-roster users
      db
        .from('notifications')
        .select('id, type, entity_name, entity_id, artist_id, read, created_at')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false })
        .limit(limit),
    ])

  if (labelResult.error) throw new Error(labelResult.error.message)
  if (portalResult.error) throw new Error(portalResult.error.message)
  if (interviewResult.error) throw new Error(interviewResult.error.message)
  if (statementResult.error) throw new Error(statementResult.error.message)
  if (platformResult.error) throw new Error(platformResult.error.message)

  const labelRows = labelResult.data ?? []
  const portalRows = portalResult.data ?? []

  const labelReadIds = userId
    ? await listReadMessageIds(db, {
        source: 'label',
        userId,
        messageIds: labelRows.map((r) => r.id),
      })
    : null
  const portalReadIds = userId
    ? await listReadMessageIds(db, {
        source: 'portal',
        userId,
        messageIds: portalRows.map((r) => r.id),
      })
    : null

  const messagesHref = buildPortalHref('/portal/messages', artistId)
  const interviewsHref = buildPortalHref('/portal/interviews', artistId)
  const statementsHref = buildPortalHref('/portal/statements', artistId)

  const items: PortalNotificationItem[] = [
    ...labelRows.map((row) => ({
      id: row.id,
      kind: 'label_message' as const,
      title: row.subject,
      href: messagesHref,
      createdAt: row.sent_at,
      isUnread: labelReadIds
        ? !labelReadIds.has(row.id)
        : !row.read,
      canMarkRead: true,
    })),
    ...portalRows.map((row) => ({
      id: row.id,
      kind: 'portal_message' as const,
      title: row.subject,
      href: messagesHref,
      createdAt: row.sent_at,
      isUnread: portalReadIds
        ? !portalReadIds.has(row.id)
        : row.read_at === null,
      canMarkRead: true,
    })),
    ...(interviewResult.data ?? []).map((row) => ({
      id: row.id,
      kind: 'interview' as const,
      title: row.subject,
      href: interviewsHref,
      createdAt: row.created_at,
      // Action-required items — not dismissible from the bell
      isUnread: true,
      canMarkRead: false,
    })),
    ...(statementResult.data ?? []).map((row) => ({
      id: row.id,
      kind: 'statement' as const,
      title: row.period || row.filename,
      href: statementsHref,
      createdAt: row.created_at,
      isUnread: true,
      canMarkRead: false,
    })),
    ...(platformResult.data ?? []).map((row) => {
      const href =
        getNotificationHref(row.type, 'artist', {
          artistId: row.artist_id,
          entityId: row.entity_id,
        }) ?? buildPortalHref('/portal', artistId)
      return {
        id: row.id,
        kind: 'platform' as const,
        title: row.entity_name ?? row.type,
        href,
        createdAt: row.created_at,
        isUnread: !row.read,
        canMarkRead: true,
        platformType: row.type,
      }
    }),
  ]

  return items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

/**
 * Mark all dismissible bell items read for this artist.
 * Writes legacy message flags AND per-user receipts (required for badge counts).
 */
export async function markAllPortalMessagesRead(
  db: DbClient,
  artistId: string,
  userId?: string | null,
): Promise<void> {
  const now = new Date().toISOString()

  const [labelIdsResult, portalIdsResult, labelResult, portalResult, platformResult] =
    await Promise.all([
      db
        .from('label_messages')
        .select('id')
        .eq('artist_id', artistId)
        .is('deleted_at', null)
        .order('sent_at', { ascending: false })
        .limit(200),
      db
        .from('portal_messages')
        .select('id')
        .eq('to_artist_id', artistId)
        .is('deleted_at', null)
        .order('sent_at', { ascending: false })
        .limit(200),
      db
        .from('label_messages')
        .update({ read: true, read_at: now })
        .eq('artist_id', artistId)
        .eq('read', false)
        .is('deleted_at', null),
      db
        .from('portal_messages')
        .update({ read_at: now })
        .eq('to_artist_id', artistId)
        .is('read_at', null)
        .is('deleted_at', null),
      db
        .from('notifications')
        .update({ read: true })
        .eq('artist_id', artistId)
        .eq('read', false),
    ])

  if (labelIdsResult.error) throw new Error(labelIdsResult.error.message)
  if (portalIdsResult.error) throw new Error(portalIdsResult.error.message)
  if (labelResult.error) throw new Error(labelResult.error.message)
  if (portalResult.error) throw new Error(portalResult.error.message)
  if (platformResult.error) throw new Error(platformResult.error.message)

  if (userId) {
    const labelIds = (labelIdsResult.data ?? []).map((r) => r.id)
    const portalIds = (portalIdsResult.data ?? []).map((r) => r.id)
    await Promise.all([
      upsertMessageReceipts(db, {
        source: 'label',
        messageIds: labelIds,
        userId,
      }),
      upsertMessageReceipts(db, {
        source: 'portal',
        messageIds: portalIds,
        userId,
      }),
    ])
  }
}

export async function markPortalNotificationItemRead(
  db: DbClient,
  item: Pick<PortalNotificationItem, 'id' | 'kind'>,
  userId?: string | null,
): Promise<void> {
  if (item.kind === 'label_message') {
    await markMessageRead(db, item.id, userId)
    return
  }

  if (item.kind === 'portal_message') {
    await markPortalMessageRead(db, item.id, userId)
    return
  }

  if (item.kind === 'platform') {
    await markNotificationRead(db, item.id)
  }
}
