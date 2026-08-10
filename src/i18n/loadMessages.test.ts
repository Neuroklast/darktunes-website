import { describe, expect, it } from 'vitest'
import { ROUTE_BUNDLES, resolveBundle } from './loadMessages'

/**
 * The root layout (app/layout.tsx) renders SiteHeader, SiteFooter,
 * ConsentBanner and PWAInstallPrompt around EVERY route, so their namespaces
 * must survive whichever bundle a route resolves to. Regressions here surface
 * only at runtime as `MISSING_MESSAGE: <ns>` on a route nobody re-tested —
 * that is how /login lost `portal`, and /promo-pool lost `footer`.
 */
const SHELL_NAMESPACES = ['navigation', 'footer', 'consent', 'pwa', 'errors'] as const

/** One representative path per ROUTE_BUNDLES prefix, plus fall-through cases. */
const REPRESENTATIVE_PATHS = [
  '/',
  '/login',
  '/artists',
  '/releases/some-release',
  '/portal',
  '/portal/help',
  '/admin',
  '/admin/events',
  '/editor',
  '/press',
  '/press/dashboard',
  '/promo-pool',
  '/events/123',
  '/fan/some-artist',
  '/an/unmapped/route',
  '',
]

describe('resolveBundle', () => {
  it('includes every shell namespace for each declared route bundle', () => {
    for (const prefix of Object.keys(ROUTE_BUNDLES)) {
      const pathname = prefix === '*' ? '/some-public-page' : prefix
      const bundle = resolveBundle(pathname)
      for (const namespace of SHELL_NAMESPACES) {
        expect(bundle, `${prefix} is missing "${namespace}"`).toContain(namespace)
      }
    }
  })

  it('includes every shell namespace for representative pathnames', () => {
    for (const pathname of REPRESENTATIVE_PATHS) {
      const bundle = resolveBundle(pathname)
      for (const namespace of SHELL_NAMESPACES) {
        expect(bundle, `"${pathname}" is missing "${namespace}"`).toContain(namespace)
      }
    }
  })

  it('returns no duplicate namespaces', () => {
    for (const pathname of REPRESENTATIVE_PATHS) {
      const bundle = resolveBundle(pathname)
      expect(new Set(bundle).size, `"${pathname}" has duplicates`).toBe(bundle.length)
    }
  })

  it('picks the longest matching prefix', () => {
    // /press/dashboard must resolve via /press, not the public fallback.
    expect(resolveBundle('/press/dashboard')).toContain('pressDashboard')
    // /promo-pool must not be swallowed by an unrelated prefix.
    expect(resolveBundle('/promo-pool')).toContain('promoPool')
  })

  it('keeps route-specific namespaces out of the public bundle', () => {
    // portal.json is ~78 KB; shipping it to every public page is a regression.
    expect(resolveBundle('/an/unmapped/route')).not.toContain('portal')
    expect(resolveBundle('/an/unmapped/route')).not.toContain('admin')
  })

  it('gives the login form its portal strings', () => {
    // The original MISSING_MESSAGE: portal (en) regression.
    expect(resolveBundle('/login')).toContain('portal')
  })
})
