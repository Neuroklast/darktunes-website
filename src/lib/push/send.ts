/**
 * Send Web Push notifications to stored subscriptions (service-role).
 * Fire-and-forget safe: never throws to callers of emitNotification.
 */

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getUsersWithPushDisabled } from '@/lib/notifications/preferences'
import { getNotificationHref, getNotificationSummaryFallback } from '@/lib/notifications/routing'
import type { NotificationEventType } from '@/lib/notifications/types'
import { getCatalogEntry } from '@/lib/notifications/catalog'
import { getVapidConfig, isWebPushConfigured } from './vapid'
import {
  countUnreadNotifications,
  deletePushSubscriptionById,
  listPushSubscriptionsForUsers,
} from './subscriptions'
import type { WebPushPayload } from './types'

type DbClient = SupabaseClient<Database>

export interface SendPushForNotificationInput {
  type: NotificationEventType
  userIds: string[]
  entityId: string
  entityName?: string | null
  artistId?: string | null
}

let vapidConfigured = false

function ensureWebPush(): boolean {
  if (!isWebPushConfigured()) return false
  if (vapidConfigured) return true
  const config = getVapidConfig()
  if (!config) return false
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  vapidConfigured = true
  return true
}

/**
 * Sends a product notification as Web Push to eligible recipients.
 * Filters users with push=false preferences. Drops expired endpoints.
 */
export async function sendPushForNotification(
  db: DbClient,
  input: SendPushForNotificationInput,
): Promise<{ sent: number; skipped: number; failed: number }> {
  if (!ensureWebPush()) {
    return { sent: 0, skipped: input.userIds.length, failed: 0 }
  }

  const uniqueUserIds = [...new Set(input.userIds.filter(Boolean))]
  if (uniqueUserIds.length === 0) {
    return { sent: 0, skipped: 0, failed: 0 }
  }

  let recipients = uniqueUserIds
  try {
    const muted = await getUsersWithPushDisabled(db, uniqueUserIds, input.type)
    if (muted.size > 0) {
      recipients = uniqueUserIds.filter((id) => !muted.has(id))
    }
  } catch (err) {
    console.warn('[sendPushForNotification] preference filter skipped:', err)
  }

  if (recipients.length === 0) {
    return { sent: 0, skipped: uniqueUserIds.length, failed: 0 }
  }

  let subscriptions
  try {
    subscriptions = await listPushSubscriptionsForUsers(db, recipients)
  } catch (err) {
    console.warn('[sendPushForNotification] list subscriptions failed:', err)
    return { sent: 0, skipped: recipients.length, failed: 0 }
  }

  if (subscriptions.length === 0) {
    return { sent: 0, skipped: recipients.length, failed: 0 }
  }

  const entry = getCatalogEntry(input.type)
  const roleHint =
    entry.audience === 'staff' ? 'admin' : entry.audience === 'artist' ? 'artist' : 'user'
  const url =
    getNotificationHref(input.type, roleHint, {
      artistId: input.artistId,
      entityId: input.entityId,
    }) ?? (entry.audience === 'staff' ? '/admin' : '/portal')

  const title = getNotificationSummaryFallback(input.type, input.entityName)
  const body = input.entityName?.trim()
    ? String(input.entityName)
    : getNotificationSummaryFallback(input.type)

  // Badge counts per user (best-effort)
  const badgeByUser = new Map<string, number>()
  await Promise.all(
    recipients.map(async (userId) => {
      const n = await countUnreadNotifications(db, userId)
      badgeByUser.set(userId, Math.max(1, n))
    }),
  )

  let sent = 0
  let failed = 0

  await Promise.all(
    subscriptions.map(async (sub) => {
      const payload: WebPushPayload = {
        title,
        body,
        url,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `${input.type}:${input.entityId}`,
        badgeCount: badgeByUser.get(sub.userId) ?? 1,
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: 'normal' },
        )
        sent += 1
      } catch (err: unknown) {
        failed += 1
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : undefined
        // Gone / Not Found → drop dead subscription
        if (statusCode === 404 || statusCode === 410) {
          try {
            await deletePushSubscriptionById(db, sub.id)
          } catch {
            // ignore cleanup errors
          }
        } else {
          console.warn('[sendPushForNotification] send failed:', statusCode ?? err)
        }
      }
    }),
  )

  return {
    sent,
    skipped: uniqueUserIds.length - recipients.length,
    failed,
  }
}
