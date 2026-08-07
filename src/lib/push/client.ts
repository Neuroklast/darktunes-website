/**
 * Browser-side Web Push helpers (permission + subscribe).
 * Zero-config UX: one Enable click → permission → auto-register with backend.
 */

'use client'

const DISMISS_KEY = 'dt-push-enable-dismissed'
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

export function isPushEnableDismissed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const until = Number(raw)
    if (!Number.isFinite(until)) return false
    return Date.now() < until
  } catch {
    return false
  }
}

export function dismissPushEnableBanner(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS))
  } catch {
    // ignore
  }
}

export function clearPushEnableDismiss(): void {
  try {
    localStorage.removeItem(DISMISS_KEY)
  } catch {
    // ignore
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    // Prefer ready registration (Serwist registers at /sw.js in production)
    const ready = await navigator.serviceWorker.ready
    return ready
  } catch {
    return null
  }
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid-public-key', { method: 'GET' })
    if (!res.ok) return null
    const data = (await res.json()) as { publicKey?: string | null; configured?: boolean }
    if (!data.configured || !data.publicKey) return null
    return data.publicKey
  } catch {
    return null
  }
}

export async function subscribeToWebPush(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported' }
  }

  const publicKey = await fetchVapidPublicKey()
  if (!publicKey) {
    return { ok: false, reason: 'not_configured' }
  }

  let permission = Notification.permission
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) {
    return { ok: false, reason: 'no_service_worker' }
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, reason: 'invalid_subscription' }
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
    }),
  })

  if (!res.ok) {
    return { ok: false, reason: 'server_error' }
  }

  clearPushEnableDismiss()
  return { ok: true }
}

/** Re-sync existing granted subscription to the server (login / new device session). */
export async function ensurePushSubscriptionSynced(): Promise<boolean> {
  if (!isPushSupported()) return false
  if (Notification.permission !== 'granted') return false

  const publicKey = await fetchVapidPublicKey()
  if (!publicKey) return false

  const registration = await getServiceWorkerRegistration()
  if (!registration) return false

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
    } catch {
      return false
    }
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function unsubscribeFromWebPush(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await getServiceWorkerRegistration()
  if (!registration) return
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
  } catch {
    // still try local unsubscribe
  }
  try {
    await subscription.unsubscribe()
  } catch {
    // ignore
  }
}
