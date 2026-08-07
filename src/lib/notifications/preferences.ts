/**
 * Per-user notification channel preferences.
 * Missing rows mean defaults: in_app=true, email=true, push=true.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { NotificationEventType } from './types'
import { ALL_NOTIFICATION_EVENT_TYPES } from './catalog'

type DbClient = SupabaseClient<Database>

export interface NotificationPreference {
  eventType: NotificationEventType | string
  inApp: boolean
  email: boolean
  push: boolean
}

export async function getUserNotificationPreferences(
  db: DbClient,
  userId: string,
): Promise<NotificationPreference[]> {
  const { data, error } = await db
    .from('notification_preferences')
    .select('event_type, in_app, email, push')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  const byType = new Map(
    (data ?? []).map((row) => [
      row.event_type,
      {
        eventType: row.event_type,
        inApp: row.in_app,
        email: row.email,
        push: row.push ?? true,
      },
    ]),
  )

  return ALL_NOTIFICATION_EVENT_TYPES.map((eventType) => {
    const existing = byType.get(eventType)
    return existing ?? { eventType, inApp: true, email: true, push: true }
  })
}

/** Returns user IDs that have in_app disabled for this event type. */
export async function getUsersWithInAppDisabled(
  db: DbClient,
  userIds: string[],
  eventType: string,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()

  const { data, error } = await db
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', userIds)
    .eq('event_type', eventType)
    .eq('in_app', false)

  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((row) => row.user_id))
}

/** Returns user IDs that have push disabled for this event type. */
export async function getUsersWithPushDisabled(
  db: DbClient,
  userIds: string[],
  eventType: string,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()

  const { data, error } = await db
    .from('notification_preferences')
    .select('user_id')
    .in('user_id', userIds)
    .eq('event_type', eventType)
    .eq('push', false)

  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((row) => row.user_id))
}

export async function upsertNotificationPreferences(
  db: DbClient,
  userId: string,
  prefs: Array<{ eventType: string; inApp: boolean; email: boolean; push: boolean }>,
): Promise<void> {
  if (prefs.length === 0) return

  const rows = prefs.map((p) => ({
    user_id: userId,
    event_type: p.eventType,
    in_app: p.inApp,
    email: p.email,
    push: p.push,
  }))

  const { error } = await db.from('notification_preferences').upsert(rows, {
    onConflict: 'user_id,event_type',
  })
  if (error) throw new Error(error.message)
}
