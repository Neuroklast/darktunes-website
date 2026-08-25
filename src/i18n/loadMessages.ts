import type { Dictionary, Locale } from './types'

const NAMESPACES = [
  'navigation',
  'hero',
  'artists',
  'releases',
  'news',
  'videos',
  'concerts',
  'spotify',
  'footer',
  'newsletter',
  'consent',
  'releaseDetail',
  'artistDetail',
  'pages',
  'portal',
  'portalHelp',
  'press',
  'pressDashboard',
  'promoPool',
  'contact',
  'newsPage',
  'about',
  'datenschutz',
  'impressum',
  'pressReleases',
  'pressKit',
  'apply',
  'pressProfile',
  'pressContact',
  'pressLanding',
  'pressLogin',
  'adminSubmissions',
  'errors',
  'admin',
  'pwa',
] as const satisfies readonly (keyof Dictionary)[]

type Namespace = (typeof NAMESPACES)[number]

/**
 * Namespaces rendered by the root layout shell (app/layout.tsx), which wraps
 * EVERY route: SiteHeader (navigation), SiteFooter (footer), ConsentBanner
 * (consent), PWAInstallPrompt (pwa), plus `errors` for error boundaries.
 *
 * resolveBundle() merges these into every bundle rather than repeating them
 * per route. Do NOT try to trim them from dashboard bundles on the grounds
 * that NavHidingWrapper renders null there: that component hides the header
 * and footer from its own HIDDEN_PREFIXES list, and coupling the two lists
 * silently breaks routes it does not hide — /promo-pool rendered SiteFooter
 * with no `footer` namespace for exactly that reason. All five files together
 * are ~3.5 KB, cheaper than the class of MISSING_MESSAGE bugs it avoids.
 */
const SHELL_NAMESPACES = [
  'navigation',
  'footer',
  'consent',
  'pwa',
  'errors',
] as const satisfies readonly Namespace[]

/** Content namespaces shared by every public (non-dashboard) page. */
const PUBLIC_NAMESPACES = [
  'hero',
  'artists',
  'releases',
  'news',
  'videos',
  'concerts',
  'spotify',
  'newsletter',
  'releaseDetail',
  'artistDetail',
  'pages',
  'newsPage',
  'about',
  'datenschutz',
  'impressum',
  'contact',
] as const satisfies readonly Namespace[]

/**
 * Per-route namespace bundles, layered ON TOP OF SHELL_NAMESPACES.
 *
 * Each entry is a prefix string mapped to the route-specific namespaces that
 * routes under that prefix consume.  resolveBundle() picks the longest
 * matching prefix so more-specific entries always win, then merges the shell.
 *
 * When adding a new namespace, extend the appropriate bundle (or add a new one)
 * so it is not silently dropped for the relevant route group.
 */
export const ROUTE_BUNDLES: Record<string, readonly Namespace[]> = {
  // Standalone centralized login page — needs portal strings for the form
  // plus the public shell (header, footer, consent, PWA prompt).
  '/login': ['portal', 'navigation', 'footer', 'consent', 'errors', 'pwa'],
  // `newsletter`: /portal/fan-page embeds the public NewsletterSection.
  '/portal': ['portal', 'portalHelp', 'newsletter', 'errors', 'pwa'],
  // Admin reuses portal components (e.g. EventManager) — include portal strings
  // or keys render as raw "portal.tour_heading" in the admin UI.
  '/admin': ['admin', 'adminSubmissions', 'portal', 'errors', 'pwa'],
  '/editor': ['admin', 'adminSubmissions', 'portal', 'errors', 'pwa'],
  '/press': [
    'press',
    'pressLanding',
    'pressLogin',
    'apply',
    'portal',
    'pressContact',
    'pressDashboard',
    'pressReleases',
    'pressKit',
    'pressProfile',
    'promoPool',
  ],
  '/promo-pool': ['promoPool'],
  // Public detail pages that reuse portal-owned components. Scoped to these
  // prefixes because portal.json is ~78 KB — far too large for the * bundle.
  '/events': [...PUBLIC_NAMESPACES, 'portal'],
  '/fan': [...PUBLIC_NAMESPACES, 'portal'],
  // Default public bundle used for every other route
  '*': PUBLIC_NAMESPACES,
}

/**
 * Returns the namespace bundle for a given pathname: the always-present shell
 * namespaces plus the longest-prefix route match (falling back to * / public).
 */
export function resolveBundle(pathname: string): readonly Namespace[] {
  const prefixes = Object.keys(ROUTE_BUNDLES).filter((p) => p !== '*')
  const match = prefixes
    .filter((p) => pathname === p || pathname.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0]
  const routeBundle = ROUTE_BUNDLES[match ?? '*'] ?? ROUTE_BUNDLES['*']!
  return [...new Set([...SHELL_NAMESPACES, ...routeBundle])]
}

const loaders: Record<Locale, Record<Namespace, () => Promise<unknown>>> = {
  en: {
    navigation: () => import('./messages/en/navigation.json').then((m) => m.default),
    hero: () => import('./messages/en/hero.json').then((m) => m.default),
    artists: () => import('./messages/en/artists.json').then((m) => m.default),
    releases: () => import('./messages/en/releases.json').then((m) => m.default),
    news: () => import('./messages/en/news.json').then((m) => m.default),
    videos: () => import('./messages/en/videos.json').then((m) => m.default),
    concerts: () => import('./messages/en/concerts.json').then((m) => m.default),
    spotify: () => import('./messages/en/spotify.json').then((m) => m.default),
    footer: () => import('./messages/en/footer.json').then((m) => m.default),
    newsletter: () => import('./messages/en/newsletter.json').then((m) => m.default),
    consent: () => import('./messages/en/consent.json').then((m) => m.default),
    releaseDetail: () => import('./messages/en/releaseDetail.json').then((m) => m.default),
    artistDetail: () => import('./messages/en/artistDetail.json').then((m) => m.default),
    pages: () => import('./messages/en/pages.json').then((m) => m.default),
    portal: () => import('./messages/en/portal.json').then((m) => m.default),
    portalHelp: () => import('./messages/en/portalHelp.json').then((m) => m.default),
    press: () => import('./messages/en/press.json').then((m) => m.default),
    pressDashboard: () => import('./messages/en/pressDashboard.json').then((m) => m.default),
    promoPool: () => import('./messages/en/promoPool.json').then((m) => m.default),
    contact: () => import('./messages/en/contact.json').then((m) => m.default),
    newsPage: () => import('./messages/en/newsPage.json').then((m) => m.default),
    about: () => import('./messages/en/about.json').then((m) => m.default),
    datenschutz: () => import('./messages/en/datenschutz.json').then((m) => m.default),
    impressum: () => import('./messages/en/impressum.json').then((m) => m.default),
    pressReleases: () => import('./messages/en/pressReleases.json').then((m) => m.default),
    pressKit: () => import('./messages/en/pressKit.json').then((m) => m.default),
    apply: () => import('./messages/en/apply.json').then((m) => m.default),
    pressProfile: () => import('./messages/en/pressProfile.json').then((m) => m.default),
    pressContact: () => import('./messages/en/pressContact.json').then((m) => m.default),
    pressLanding: () => import('./messages/en/pressLanding.json').then((m) => m.default),
    pressLogin: () => import('./messages/en/pressLogin.json').then((m) => m.default),
    adminSubmissions: () => import('./messages/en/adminSubmissions.json').then((m) => m.default),
    errors: () => import('./messages/en/errors.json').then((m) => m.default),
    admin: () => import('./messages/en/admin.json').then((m) => m.default),
    pwa: () => import('./messages/en/pwa.json').then((m) => m.default),
  },
  de: {
    navigation: () => import('./messages/de/navigation.json').then((m) => m.default),
    hero: () => import('./messages/de/hero.json').then((m) => m.default),
    artists: () => import('./messages/de/artists.json').then((m) => m.default),
    releases: () => import('./messages/de/releases.json').then((m) => m.default),
    news: () => import('./messages/de/news.json').then((m) => m.default),
    videos: () => import('./messages/de/videos.json').then((m) => m.default),
    concerts: () => import('./messages/de/concerts.json').then((m) => m.default),
    spotify: () => import('./messages/de/spotify.json').then((m) => m.default),
    footer: () => import('./messages/de/footer.json').then((m) => m.default),
    newsletter: () => import('./messages/de/newsletter.json').then((m) => m.default),
    consent: () => import('./messages/de/consent.json').then((m) => m.default),
    releaseDetail: () => import('./messages/de/releaseDetail.json').then((m) => m.default),
    artistDetail: () => import('./messages/de/artistDetail.json').then((m) => m.default),
    pages: () => import('./messages/de/pages.json').then((m) => m.default),
    portal: () => import('./messages/de/portal.json').then((m) => m.default),
    portalHelp: () => import('./messages/de/portalHelp.json').then((m) => m.default),
    press: () => import('./messages/de/press.json').then((m) => m.default),
    pressDashboard: () => import('./messages/de/pressDashboard.json').then((m) => m.default),
    promoPool: () => import('./messages/de/promoPool.json').then((m) => m.default),
    contact: () => import('./messages/de/contact.json').then((m) => m.default),
    newsPage: () => import('./messages/de/newsPage.json').then((m) => m.default),
    about: () => import('./messages/de/about.json').then((m) => m.default),
    datenschutz: () => import('./messages/de/datenschutz.json').then((m) => m.default),
    impressum: () => import('./messages/de/impressum.json').then((m) => m.default),
    pressReleases: () => import('./messages/de/pressReleases.json').then((m) => m.default),
    pressKit: () => import('./messages/de/pressKit.json').then((m) => m.default),
    apply: () => import('./messages/de/apply.json').then((m) => m.default),
    pressProfile: () => import('./messages/de/pressProfile.json').then((m) => m.default),
    pressContact: () => import('./messages/de/pressContact.json').then((m) => m.default),
    pressLanding: () => import('./messages/de/pressLanding.json').then((m) => m.default),
    pressLogin: () => import('./messages/de/pressLogin.json').then((m) => m.default),
    adminSubmissions: () => import('./messages/de/adminSubmissions.json').then((m) => m.default),
    errors: () => import('./messages/de/errors.json').then((m) => m.default),
    admin: () => import('./messages/de/admin.json').then((m) => m.default),
    pwa: () => import('./messages/de/pwa.json').then((m) => m.default),
  },
  fr: {
    navigation: () => import('./messages/fr/navigation.json').then((m) => m.default),
    hero: () => import('./messages/fr/hero.json').then((m) => m.default),
    artists: () => import('./messages/fr/artists.json').then((m) => m.default),
    releases: () => import('./messages/fr/releases.json').then((m) => m.default),
    news: () => import('./messages/fr/news.json').then((m) => m.default),
    videos: () => import('./messages/fr/videos.json').then((m) => m.default),
    concerts: () => import('./messages/fr/concerts.json').then((m) => m.default),
    spotify: () => import('./messages/fr/spotify.json').then((m) => m.default),
    footer: () => import('./messages/fr/footer.json').then((m) => m.default),
    newsletter: () => import('./messages/fr/newsletter.json').then((m) => m.default),
    consent: () => import('./messages/fr/consent.json').then((m) => m.default),
    releaseDetail: () => import('./messages/fr/releaseDetail.json').then((m) => m.default),
    artistDetail: () => import('./messages/fr/artistDetail.json').then((m) => m.default),
    pages: () => import('./messages/fr/pages.json').then((m) => m.default),
    portal: () => import('./messages/fr/portal.json').then((m) => m.default),
    portalHelp: () => import('./messages/fr/portalHelp.json').then((m) => m.default),
    press: () => import('./messages/fr/press.json').then((m) => m.default),
    pressDashboard: () => import('./messages/fr/pressDashboard.json').then((m) => m.default),
    promoPool: () => import('./messages/fr/promoPool.json').then((m) => m.default),
    contact: () => import('./messages/fr/contact.json').then((m) => m.default),
    newsPage: () => import('./messages/fr/newsPage.json').then((m) => m.default),
    about: () => import('./messages/fr/about.json').then((m) => m.default),
    datenschutz: () => import('./messages/fr/datenschutz.json').then((m) => m.default),
    impressum: () => import('./messages/fr/impressum.json').then((m) => m.default),
    pressReleases: () => import('./messages/fr/pressReleases.json').then((m) => m.default),
    pressKit: () => import('./messages/fr/pressKit.json').then((m) => m.default),
    apply: () => import('./messages/fr/apply.json').then((m) => m.default),
    pressProfile: () => import('./messages/fr/pressProfile.json').then((m) => m.default),
    pressContact: () => import('./messages/fr/pressContact.json').then((m) => m.default),
    pressLanding: () => import('./messages/fr/pressLanding.json').then((m) => m.default),
    pressLogin: () => import('./messages/fr/pressLogin.json').then((m) => m.default),
    adminSubmissions: () => import('./messages/fr/adminSubmissions.json').then((m) => m.default),
    errors: () => import('./messages/fr/errors.json').then((m) => m.default),
    admin: () => import('./messages/fr/admin.json').then((m) => m.default),
    pwa: () => import('./messages/fr/pwa.json').then((m) => m.default),
  },
}

/**
 * Load i18n messages for the given locale.
 *
 * Pass an optional filter array (a subset of Namespace keys) to load only
 * the namespaces needed for the current route.  When omitted, all namespaces
 * are loaded (useful for tests and build-time paths that need the full dictionary).
 */
export async function loadMessages(
  locale: Locale,
  filter?: readonly Namespace[],
): Promise<Dictionary> {
  const localeLoaders = loaders[locale] ?? loaders.en
  const namespaces: readonly Namespace[] = filter ?? NAMESPACES
  const entries = await Promise.all(
    namespaces.map(async (namespace) => [namespace, await localeLoaders[namespace]()] as const),
  )
  return Object.fromEntries(entries) as Dictionary
}