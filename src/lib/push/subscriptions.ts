/**
 * DAL for push_subscriptions — store browser Web Push endpoints.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PushSubscriptionKeys } from './types'

type DbClient = SupabaseClient<Database>

export interface StoredPushSubscription extends PushSubscriptionKeys {
  id: string
  userId: string
}

export async function upsertPushSubscription(
  db: DbClient,
  userId: string,
  sub: PushSubscriptionKeys,
  userAgent?: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: userAgent ?? null,
      last_seen_at: now,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(error.message)
}

export async function deletePushSubscriptionByEndpoint(
  db: DbClient,
  userId: string,
  endpoint: string,
): Promise<void> {
  const { error } = await db
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
  if (error) throw new Error(error.message)
}

export async function listPushSubscriptionsForUsers(
  db: DbClient,
  userIds: string[],
): Promise<StoredPushSubscription[]> {
  if (userIds.length === 0) return []

  const { data, error } = await db
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
  }))
}

export async function deletePushSubscriptionById(
  db: DbClient,
  id: string,
): Promise<void> {
  const { error } = await db.from('push_subscriptions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Unread in-app notification rows for badge hints on push payloads. */
export async function countUnreadNotifications(
  db: DbClient,
  userId: string,
): Promise<number> {
  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)

  if (error) return 0
  return count ?? 0
}
