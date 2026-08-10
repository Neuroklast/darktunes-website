/**
 * tests/e2e/press-sections.spec.ts — Phase 8 coverage for /press/*
 *
 * Covers the journalist dashboard sections, the two public press detail
 * routes, and the journalist-application → admin-accreditation round trip.
 *
 * The round-trip test is the only spec here that creates a row. It follows
 * the convention in tests/helpers/README.md: an `e2e-<testId>` prefixed
 * identifier, plus an afterAll that deletes it over a direct Postgres
 * connection (PostgREST only exposes the public schema, and the row is
 * service-role-owned).
 */

import { test, expect, type Page } from '@playwright/test'
import { Client } from 'pg'
import { loginAsAdmin, loginForPressDashboard } from '../helpers/auth'
import { SEED_IDS } from './fixtures/seed-ids'

/** Journalist dashboard sections, all under app/press/dashboard/. */
const PRESS_DASHBOARD_SECTIONS = [
  '/press/dashboard',
  '/press/dashboard/press-kit',
  '/press/dashboard/press-releases',
  '/press/dashboard/interviews',
  '/press/dashboard/accreditation',
  '/press/dashboard/contact',
  '/press/dashboard/download-history',
  '/press/dashboard/profile',
  '/press/dashboard/promo-pool',
]

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0)
}

/** next-intl renders the key path itself when a namespace didn't load, which
 *  otherwise slips past a bare "a heading is visible" assertion. */
async function expectNoUnresolvedTranslationKeys(page: Page) {
  const body = await page.locator('body').innerText()
  expect(body, 'page shows a raw next-intl key — namespace missing from ROUTE_BUNDLES?').not.toMatch(
    /\b(pressKit|pressDashboard|pressReleases|pressProfile|promoPool)\.[a-zA-Z]/,
  )
}

test.describe('Press — public routes', () => {
  test('the press landing page is reachable without a session', async ({ page }) => {
    const response = await page.goto('/press', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading').first()).toBeVisible()
  })

  test('the journalist application form is reachable without a session', async ({ page }) => {
    const response = await page.goto('/press/apply', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading').first()).toBeVisible()
  })

  test('an artist EPK page resolves for the visible fixture artist', async ({ page }) => {
    const response = await page.goto(`/press/artists/${SEED_IDS.artists.visible.slug}`, {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBe(200)
    await expect(page.getByText(SEED_IDS.artists.visible.name).first()).toBeVisible()
  })

  test('an unknown press release slug renders the not-found page, not an error', async ({
    page,
  }) => {
    // The route calls notFound() for an unknown slug, but currently answers
    // 200 rather than 404 — unresolved, see E2E-TESTS.md "Open questions".
    // What is verifiable today: it does not hit the error boundary.
    await page.goto('/press/releases/e2e-definitely-not-a-real-slug', {
      waitUntil: 'domcontentloaded',
    })
    await expectNoErrorBoundary(page)
  })
})

test.describe('Press dashboard — every section renders for a journalist', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await loginForPressDashboard(page)
  })

  test.afterAll(async () => {
    await page.close()
  })

  for (const path of PRESS_DASHBOARD_SECTIONS) {
    test(`${path} renders for the fixture journalist`, async () => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
      expect(response?.status(), `${path} should return HTTP 200`).toBe(200)

      // Staying put proves hasPressDashboardAccess() accepted this account.
      await expect(page).toHaveURL(new RegExp(`${path}$`))

      await expect(
        page.getByRole('navigation', { name: 'Press dashboard navigation' }),
      ).toBeAttached()
      await expect(page.getByRole('heading').first()).toBeVisible()
      await expectNoErrorBoundary(page)
      await expectNoUnresolvedTranslationKeys(page)
    })
  }
})

test.describe('Press — application to accreditation round trip', () => {
  const testId = `e2e-${Date.now()}`
  const applicantEmail = `${testId}@darktunes.test`
  const outlet = `${testId}-outlet`

  test.afterAll(async () => {
    const dbUrl = process.env.SUPABASE_DB_URL
    if (!dbUrl) return

    const client = new Client({ connectionString: dbUrl })
    await client.connect()
    try {
      await client.query('DELETE FROM public.journalist_applications WHERE email = $1', [
        applicantEmail,
      ])
    } finally {
      await client.end()
    }
  })

  test('a submitted application shows up for an admin to review', async ({ page, request }) => {
    const submission = await request.post('/api/journalist-applications', {
      data: {
        email: applicantEmail,
        name: `${testId} Reporter`,
        outlet,
        message: 'Automated end-to-end coverage for the accreditation flow.',
      },
    })

    // 403 means press applications are switched off site-wide — a legitimate
    // configuration, but then there is no round trip left to verify.
    if (submission.status() === 403) {
      test.skip(true, 'Press applications are disabled in site settings')
      return
    }

    expect(submission.status(), await submission.text()).toBe(201)

    await loginAsAdmin(page)

    // Verified through the admin-only list endpoint rather than the
    // /admin/accreditations table: that page renders accreditations, and a
    // freshly submitted *application* does not appear in it — which surface is
    // meant to review pending applications is an open question (E2E-TESTS.md).
    // GET /api/journalist-applications is unambiguous: it 403s for non-admins
    // and returns exactly the rows an admin is meant to triage.
    const review = await page.request.get('/api/journalist-applications')
    expect(review.status()).toBe(200)

    const { applications } = (await review.json()) as { applications: { outlet: string }[] }
    expect(applications.map((application) => application.outlet)).toContain(outlet)
  })
})
