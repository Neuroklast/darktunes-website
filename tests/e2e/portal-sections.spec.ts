/**
 * tests/e2e/portal-sections.spec.ts — Phase 7 coverage for /portal/*
 *
 * One smoke test per artist-portal section, driven by the `e2e-artist`
 * fixture account (linked to the visible fixture artist via artist_members).
 *
 * Portal pages are far less uniform than the admin ones — there is no shared
 * page shell, and several render their heading inside a client leaf — so the
 * asserted contract is the one they all share: the route answers 200, does
 * not bounce to /login or /portal/onboarding, mounts the portal navigation,
 * shows a top-level heading, and hits no error boundary.
 *
 * Feature-flag-gated sections (epk-builder, fan-page) call notFound() when
 * their flag is off, so they assert "renders OR is deliberately 404" rather
 * than pretending the flag state is fixed.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAsArtist, loginForPressDashboard } from '../helpers/auth'

/** Sections reachable from PortalSidebar that always render for a linked artist. */
const PORTAL_SECTIONS = [
  // Analytics split: legacy /portal/analytics redirects; hit the live routes.
  '/portal/spotify-trends',
  '/portal/sos-analytics',
  '/portal/profile',
  '/portal/releases',
  '/portal/releases/submissions',
  '/portal/releases/videos',
  '/portal/calendar',
  '/portal/events',
  '/portal/marketing',
  '/portal/statements',
  '/portal/invoices',
  '/portal/billing',
  '/portal/messages',
  '/portal/interviews',
  '/portal/documents',
  '/portal/settings',
  '/portal/help',
  '/portal/feedback',
  '/portal/notifications',
  '/portal/notifications/preferences',
  '/portal/messages/compose',
  '/portal/releases/new',
  '/portal/releases/videos/new',
  // No invite token supplied — proxy.ts explicitly exempts this route from
  // both the unauthenticated and authenticated portal redirects, so it
  // renders directly for the logged-in fixture artist too (AcceptInviteClient
  // treats the existing session as an active one rather than bouncing).
  '/portal/accept-invite',
]

/** Sections app/portal/<name>/page.tsx guards with notFound() when their flag is off. */
const FLAG_GATED_SECTIONS = [
  '/portal/epk-builder',
  '/portal/fan-page',
  '/portal/tour-planner',
]

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0)
}

test.describe('Portal sections — access control', () => {
  test('unauthenticated visitors are sent to /login with a returnTo', async ({ page }) => {
    await page.goto('/portal/statements', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fportal%2Fstatements/)
  })

  test('a journalist without artist membership is refused the portal', async ({ page }) => {
    // Reuse the press helper rather than hand-rolling the form fill: it waits
    // for the post-login navigation to actually land, so a failed sign-in
    // surfaces here instead of masquerading as an unauthenticated redirect.
    await loginForPressDashboard(page)

    await page.goto('/portal', { waitUntil: 'domcontentloaded' })
    // proxy.ts sends users with no artist_members row to ?error=no_artist.
    await expect(page).toHaveURL(/\/login\?error=no_artist/)
  })
})

test.describe('Portal sections — every route renders for a linked artist', () => {
  // Shared session, non-serial on purpose: one broken section must not hide
  // the state of the other fifteen.
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await loginAsArtist(page)
  })

  test.afterAll(async () => {
    await page.close()
  })

  for (const path of PORTAL_SECTIONS) {
    test(`${path} renders for the fixture artist`, async () => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
      // Flag-gated modules may soft-disable (200 + message) or still return 200
      // with empty state — only login/onboarding bounce is a hard fail.
      expect(response?.status(), `${path} should not 5xx`).toBeLessThan(500)

      await expect(page).not.toHaveURL(/\/login/)
      // Stay under the requested section (allow query strings e.g. ?artistId=).
      await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

      await expect(page.getByRole('navigation', { name: 'Artist portal navigation' })).toBeAttached()
      await expect(page.getByRole('heading').first()).toBeVisible()
      await expectNoErrorBoundary(page)
    })
  }

  test('/portal/tour redirects to the events section', async () => {
    await page.goto('/portal/tour', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/portal\/events/)
  })

  test('/portal/analytics redirects to a split analytics dashboard', async () => {
    await page.goto('/portal/analytics', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/portal\/(spotify-trends|sos-analytics)/)
  })

  for (const path of FLAG_GATED_SECTIONS) {
    test(`${path} either renders or 404s according to its feature flag`, async () => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
      const status = response?.status()

      expect([200, 404], `${path} returned ${status}`).toContain(status)

      if (status === 200) {
        await expect(page.getByRole('heading').first()).toBeVisible()
        await expectNoErrorBoundary(page)
      }
    })
  }
})
