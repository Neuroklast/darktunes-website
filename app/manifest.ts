import type { MetadataRoute } from 'next'
import { getMetadataBrand } from '@/lib/seo/metadata'
import { buildDefaultSeoDescription } from '@/lib/brand/tenantDefaults'
import { getCachedSiteSettings } from '@/lib/cache/publicQueries'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'

/**
 * Dynamic PWA Web App Manifest
 *
 * Served at /manifest.webmanifest (Next.js 15 App Router convention).
 * Enables "Add to Home Screen" on Android and iOS so the site behaves like a
 * native standalone app — no browser chrome, correct splash colours, and
 * properly shaped adaptive icons.
 *
 * Icons are kept in sync with the active favicon: if a custom faviconUrl is
 * configured in admin settings, it is added as the primary app icon so that
 * the installed PWA always shows the same logo as the browser tab.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const organizationId = await getRequestOrganizationId().catch(() => undefined)
  const [settings, brand] = await Promise.all([
    getCachedSiteSettings(organizationId).catch(() => null),
    getMetadataBrand(),
  ])
  const customFaviconUrl = settings?.faviconUrl || ''

  // Determine the MIME type of the custom favicon
  const customFaviconType = customFaviconUrl.endsWith('.svg') ? 'image/svg+xml'
    : customFaviconUrl.endsWith('.ico') ? 'image/x-icon'
    : customFaviconUrl.endsWith('.webp') ? 'image/webp'
    : 'image/png'

  const icons: MetadataRoute.Manifest['icons'] = [
    // Custom favicon first — when set, this becomes the primary app icon
    ...(customFaviconUrl
      ? [{ src: customFaviconUrl, sizes: 'any', type: customFaviconType, purpose: 'any' as const }]
      : [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }]),
    // Standard raster icons (PNG, used for notifications / splash screens)
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    // Maskable icons — the OS can safely crop these into any shape (circle,
    // squircle, etc.) without adding an ugly white background box.
    // The artwork must have ~10 % safe-zone padding around the main icon.
    { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]

  return {
    name: brand.labelName,
    short_name: brand.labelShortName,
    description:
      settings?.seoDescription?.trim() ||
      buildDefaultSeoDescription(brand.labelName),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Matches --background (#101010) — prevents white flash during app boot
    background_color: '#101010',
    // Matches --primary / --accent (#493687) — used for the Android status bar
    theme_color: '#101010',
    lang: 'de',
    categories: ['music', 'entertainment'],
    icons,
    screenshots: [
      {
        src: '/icons/screenshot-desktop.png',
        sizes: '1280x720',
        type: 'image/png',
        label: `${brand.labelName} – desktop`,
      },
      {
        src: '/icons/screenshot-mobile.png',
        sizes: '390x844',
        type: 'image/png',
        label: `${brand.labelName} – mobile`,
      },
    ],
  }
}
