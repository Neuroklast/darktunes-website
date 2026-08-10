/**
 * tests/e2e/admin-sections.spec.ts — Phase 6 coverage for /admin/*
 *
 * One smoke test per dedicated admin section route, plus role-based access
 * control checks. Every section is asserted through the contract that
 * app/admin/_components/AdminPageShell.tsx guarantees for all of them:
 * a visible <h1> carrying the section's title, the sidebar entry for that
 * route marked aria-current="page", and no error boundary.
 *
 * Deliberately shallow per section: this file's job is to prove every route
 * mounts, authorizes, and renders against the real local Supabase stack.
 * Behavioural depth for individual sections lives in the dedicated specs
 * (press-kit.spec.ts, tour-planner.spec.ts, admin-scroll.spec.ts).
 *
 * Runs serially against a single logged-in admin session — re-authenticating
 * per section would dominate this file's runtime in the 3-project matrix.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsArtist } from '../helpers/auth'
import { waitForPageSettled } from '../helpers/pageSettle'

/**
 * Every /admin route reachable from AdminSidebarNav, with the exact <h1>
 * AdminPageShell renders for it. Titles are literal strings in the page
 * components except where `note` names the dictionary key, so they're
 * asserted verbatim — a renamed section should fail here, loudly.
 */
const ADMIN_SECTIONS: { path: string; heading: string; note?: string }[] = [
  { path: '/admin/artists', heading: 'Artists' },
  { path: '/admin/releases', heading: 'Releases' },
  { path: '/admin/news', heading: 'News' },
  { path: '/admin/videos', heading: 'Videos' },
  { path: '/admin/events', heading: 'Events' },
  { path: '/admin/tour-planner', heading: 'Tour Planner', note: 'admin.tour_planner_page_title' },
  { path: '/admin/release-submissions', heading: 'Release Submissions' },
  { path: '/admin/video-submissions', heading: 'Video Submissions' },
  { path: '/admin/fan-page-reviews', heading: 'Personal Artist Page Reviews' },
  { path: '/admin/submission-form', heading: 'Submission Form' },
  { path: '/admin/accreditations', heading: 'Press Accreditations' },
  { path: '/admin/press', heading: 'Press Portal' },
  { path: '/admin/assets', heading: 'Assets' },
  { path: '/admin/genres', heading: 'Genre Catalogue' },
  { path: '/admin/accounting', heading: 'Accounting', note: 'admin.accounting.pageTitle' },
  { path: '/admin/analytics', heading: 'Analytics', note: 'admin.labelIntelligence.pageTitle' },
  { path: '/admin/statements', heading: 'Statements', note: 'admin.accounting.statementsPageTitle' },
  { path: '/admin/messages', heading: 'Artist Messages' },
  { path: '/admin/promo-log', heading: 'Promotion Activity' },
  { path: '/admin/users', heading: 'User Management' },
  { path: '/admin/portal-faq', heading: 'Portal FAQ', note: 'admin.portalFaq.pageTitle' },
  { path: '/admin/features', heading: 'Feature Flags' },
  { path: '/admin/colors', heading: 'Color Theme' },
  { path: '/admin/settings', heading: 'Settings' },
  { path: '/admin/api-keys', heading: 'Integrations', note: 'admin.apiKeys.pageTitle' },
  { path: '/admin/support', heading: 'Support', note: 'admin.support.pageTitle' },
  { path: '/admin/system', heading: 'System' },
  { path: '/admin/feedback', heading: 'Artist Feedback', note: 'admin.feedback.pageTitle' },
]

/** Sub-routes reached from a section rather than the sidebar. */
const ADMIN_SUBROUTES: { path: string; heading: string; note?: string }[] = [
  { path: '/admin/news/new', heading: 'New News Post' },
  { path: '/admin/messages/compose', heading: 'Compose Message' },
  { path: '/admin/notifications', heading: 'Notification center', note: 'admin.notifications.centerTitle' },
  { path: '/admin/notifications/preferences', heading: 'Notification preferences', note: 'admin.notifications.preferencesTitle' },
]

/** app/error.tsx's boundary — its presence means the route threw while rendering. */
async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0)
}

test.describe('Admin sections — RBAC', () => {
  test('unauthenticated visitors are sent to /login with a returnTo', async ({ page }) => {
    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin%2Fusers/)
  })

  test('an artist-role account is rejected from the admin panel', async ({ page }) => {
    // Sign in through the portal rather than /login?returnTo=/admin: for an
    // already-authenticated user the login page routes to
    // resolveRedirectPath(role) — /portal for an artist — so a returnTo of
    // /admin would never reach the admin guard under test.
    await loginAsArtist(page)

    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' })

    // proxy.ts bounces accounts without admin-panel access back to
    // /login?error=unauthorized rather than rendering a 403 page.
    await expect(page).toHaveURL(/\/login\?error=unauthorized/)
  })

  test('admin API routes reject an artist-role session', async ({ page }) => {
    await loginAsArtist(page)

    // Carries the logged-in artist's cookies, so this exercises the route's
    // own role check — not the unauthenticated path security.spec.ts covers.
    const response = await page.request.get('/api/admin/users')
    expect([401, 403, 404]).toContain(response.status())
  })
})

test.describe('Admin sections — every route renders for an admin', () => {
  // Deliberately NOT `mode: 'serial'`: these are independent reads sharing one
  // session, and serial mode would skip every remaining section as soon as one
  // of them broke — exactly the signal this matrix exists to give.
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await loginAsAdmin(page)
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('the /admin overview lists content stats and section shortcuts', async () => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await waitForPageSettled(page)

    // AdminOverview labels these as regions; their visible <h2>s read
    // "Content at a glance" / "Admin sections", so target the stable landmarks.
    await expect(page.getByRole('region', { name: 'Content statistics' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Admin sections' })).toBeVisible()
    await expectNoErrorBoundary(page)
  })

  test('/admin/content redirects to the artists section that replaced it', async () => {
    await page.goto('/admin/content', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/admin\/artists$/)
  })

  for (const section of ADMIN_SECTIONS) {
    test(`${section.path} renders "${section.heading}"`, async () => {
      const response = await page.goto(section.path, { waitUntil: 'domcontentloaded' })
      expect(response?.status(), `${section.path} should return HTTP 200`).toBe(200)

      // No bounce to /login — proves the admin fixture really has access.
      await expect(page).toHaveURL(new RegExp(`${section.path}$`))

      await expect(page.getByRole('heading', { level: 1, name: section.heading })).toBeVisible()
      await expectNoErrorBoundary(page)

      // The sidebar must agree with the URL, so a section can't be reachable
      // while its navigation entry silently points somewhere else.
      await expect(page.locator(`a[href="${section.path}"][aria-current="page"]`)).toHaveCount(1)
    })
  }

  for (const sub of ADMIN_SUBROUTES) {
    test(`${sub.path} renders "${sub.heading}"`, async () => {
      const response = await page.goto(sub.path, { waitUntil: 'domcontentloaded' })
      expect(response?.status(), `${sub.path} should return HTTP 200`).toBe(200)

      // .first(): the notifications routes render the shared NotificationCenter /
      // NotificationPreferencesForm's own <h1> alongside AdminPageShell's identical
      // one, so two matching headings exist — assert the first is visible rather
      // than requiring uniqueness.
      await expect(page.getByRole('heading', { level: 1, name: sub.heading }).first()).toBeVisible()
      await expectNoErrorBoundary(page)
    })
  }
})
