/**
 * Web Push payload contract (server → service worker).
 */

export interface WebPushPayload {
  title: string
  body: string
  /** Deep link opened on notification click */
  url: string
  icon?: string
  badge?: string
  tag?: string
  /** Optional launcher badge count (Badging API) */
  badgeCount?: number
}

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}
