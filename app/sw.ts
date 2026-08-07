import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  ExpirationPlugin,
} from 'serwist'

// Typescript shim for the build-injected precache manifest
declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  // Return the custom offline page when the network is unavailable
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
  runtimeCaching: [
    // --- Static assets from the Next.js build ---
    {
      matcher: /\/_next\/static\/.*/,
      handler: new CacheFirst({
        cacheName: 'next-static',
        plugins: [
          new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365 }), // 1 year
        ],
      }),
    },
    // --- Next.js image optimisation — always go to network.
    //     Caching opaque cross-origin responses here causes ERR_FAILED on
    //     hard refresh (F5) because Chrome rejects opaque (status 0) responses
    //     returned by the service worker for image requests.
    {
      matcher: /\/_next\/image/,
      handler: new NetworkOnly(),
    },
    // --- Google Fonts ---
    {
      matcher: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
      handler: new CacheFirst({
        cacheName: 'google-fonts',
        plugins: [
          new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
      }),
    },
    // --- Dashboard HTML — never cache (cookie/locale + force-dynamic shells) ---
    // NetworkFirst + pages cache made language switches appear broken: a slow
    // network could serve yesterday's HTML for /admin|/portal with the old locale.
    {
      matcher: ({ request, url }: { request: Request; url: URL }) => {
        if (request.destination !== 'document') return false
        const p = url.pathname
        return (
          p.startsWith('/admin') ||
          p.startsWith('/portal') ||
          p.startsWith('/editor') ||
          p.startsWith('/press/dashboard') ||
          p.startsWith('/login') ||
          p.startsWith('/account')
        )
      },
      handler: new NetworkOnly(),
    },
    // --- Public HTML navigation — network-first, fall back to offline ---
    {
      matcher: ({ request }: { request: Request }) => request.destination === 'document',
      handler: new NetworkFirst({
        cacheName: 'pages',
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 60,
            maxAgeSeconds: 60 * 60 * 24, // 24 h
          }),
        ],
      }),
    },
  ],
})

serwist.addEventListeners()

// ---------------------------------------------------------------------------
// Web Push + app icon badge (PWA)
// Payload shape: { title, body, url, icon?, badge?, tag?, badgeCount? }
// ---------------------------------------------------------------------------

interface PushPayload {
  title?: string
  body?: string
  url?: string
  icon?: string
  badge?: string
  tag?: string
  badgeCount?: number
}

/** Minimal SW runtime surface — app tsconfig has no DOM webworker lib. */
interface SwPushData {
  json: () => unknown
  text: () => string
}

interface SwClient {
  focus: () => Promise<unknown>
  postMessage: (message: unknown) => void
  navigate?: (url: string) => Promise<unknown>
}

interface SwScope {
  registration: {
    showNotification: (
      title: string,
      options?: Record<string, unknown>,
    ) => Promise<void>
  }
  clients: {
    matchAll: (opts: {
      type: string
      includeUncontrolled: boolean
    }) => Promise<SwClient[]>
    openWindow?: (url: string) => Promise<unknown>
  }
  location: { origin: string }
  navigator: { setAppBadge?: (n?: number) => Promise<void> }
  addEventListener: (type: string, listener: (event: SwExtendableEvent) => void) => void
}

interface SwExtendableEvent {
  data?: SwPushData | null
  notification?: {
    close: () => void
    data?: unknown
  }
  waitUntil: (p: Promise<unknown>) => void
}

const sw = self as unknown as SwScope

sw.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    if (event.data) {
      data = event.data.json() as PushPayload
    }
  } catch {
    try {
      data = { body: event.data?.text() }
    } catch {
      data = {}
    }
  }

  const title = data.title?.trim() || 'Notification'
  const options = {
    body: data.body?.trim() || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' },
    renotify: Boolean(data.tag),
  }

  const show = sw.registration.showNotification(title, options)

  const badgeWork =
    typeof data.badgeCount === 'number' && typeof sw.navigator.setAppBadge === 'function'
      ? sw.navigator.setAppBadge(Math.max(0, data.badgeCount)).catch(() => undefined)
      : Promise.resolve()

  event.waitUntil(Promise.all([show, badgeWork]))
})

sw.addEventListener('notificationclick', (event) => {
  event.notification?.close()
  const rawData = event.notification?.data
  const rawUrl =
    rawData && typeof rawData === 'object' && 'url' in rawData
      ? String((rawData as { url?: string }).url || '/')
      : '/'
  const targetUrl = rawUrl.startsWith('http')
    ? rawUrl
    : new URL(rawUrl, sw.location.origin).href

  event.waitUntil(
    (async () => {
      const allClients = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of allClients) {
        await client.focus()
        if (typeof client.navigate === 'function') {
          try {
            await client.navigate(targetUrl)
            return
          } catch {
            // fall through
          }
        }
        client.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl })
        return
      }
      if (sw.clients.openWindow) {
        await sw.clients.openWindow(targetUrl)
      }
    })(),
  )
})
