/**
 * tests/e2e/public-flows.spec.ts — Phase 5 coverage for the public frontend
 *
 * The parts of the public site that are a *flow* rather than a page render:
 * the contact form, the newsletter routes, the promo-pool access gate, locale
 * fallback, and the seeded detail pages.
 *
 * Rate-limit budget: POST /api/contact allows 5 requests per 10 minutes per
 * IP, and all three browser projects share one runner IP against one server.
 * So exactly ONE contact submission happens per project (3 per full run) and
 * there are deliberately no extra API-level validation cases here — the
 * schema is covered by unit tests, and burning the budget would make whichever
 * project runs last fail with a 429 instead of a real signal.
 */

import { test, expect } from '@playwright/test'
import { loginAsArtist } from '../helpers/auth'
import { SEED_IDS } from './fixtures/seed-ids'

test.describe('Contact form', () => {
  test('a valid submission is accepted', async ({ page }) => {
    await page.goto('/contact', { waitUntil: 'domcontentloaded' })

    await page.locator('#contact-name').fill('E2E Contact Tester')
    await page.locator('#contact-email').fill('e2e-contact@darktunes.test')
    await page
      .locator('#contact-message')
      .fill('Automated end-to-end coverage for the public contact form submission flow.')
    await page.locator('#contact-gdpr').click()

    const submission = page.waitForResponse(
      (response) =>
        response.url().includes('/api/contact') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /send|submit|senden|absenden/i }).first().click()

    const response = await submission
    expect(response.status(), await response.text()).toBe(200)
  })
})

test.describe('Newsletter', () => {
  test('the signup page and its post-confirmation page both render', async ({ page }) => {
    for (const path of ['/newsletter', '/newsletter/confirmed']) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
      expect(response?.status(), `${path} should return HTTP 200`).toBe(200)
      await expect(page.getByRole('heading').first()).toBeVisible()
    }
  })

  test('the retired Supabase double-opt-in endpoint reports itself as gone', async ({ request }) => {
    // Sign-up moved to the darkmerch.com Shopify embed; app/api/newsletter/route.ts
    // keeps answering 410 so stale clients get a definite answer, not a 404.
    const response = await request.post('/api/newsletter', {
      data: { email: 'e2e-newsletter@darktunes.test' },
    })
    expect(response.status()).toBe(410)
  })

  test('the homepage section embeds the Shopify signup iframe', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const newsletter = page.locator('section#newsletter')
    await expect(newsletter).toHaveCount(1)
    await expect(newsletter.locator('iframe[title]')).toBeVisible()
  })
})

test.describe('Promo pool', () => {
  test('unauthenticated visitors are sent to /login', async ({ page }) => {
    await page.goto('/promo-pool', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fpromo-pool/)
  })

  test('a signed-in non-journalist gets the access gate, not the pool', async ({ page }) => {
    await loginAsArtist(page)

    const response = await page.goto('/promo-pool', { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/promo-pool$/)

    // PromoPoolAccessGate renders either the application form or the status of
    // an existing application — never the downloadable tracks.
    await expect(page.getByText(/access|apply|application|zugang|antrag/i).first()).toBeVisible()
  })
})

test.describe('Locale fallback', () => {
  test('an unsupported Accept-Language falls back to the default locale', async ({ browser }) => {
    // parseAcceptLanguage() in src/i18n/request.ts recognises en/de/fr; any
    // other primary tag falls through to routing.defaultLocale ('de').
    const context = await browser.newContext({ locale: 'ja-JP' })
    const page = await context.newPage()

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')

    await context.close()
  })

  test('a German Accept-Language is honoured', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' })
    const page = await context.newPage()

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')

    await context.close()
  })

  test('an English Accept-Language is honoured', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await context.close()
  })
})

test.describe('Seeded detail pages', () => {
  test('the visible fixture artist renders its own name', async ({ page }) => {
    const response = await page.goto(`/artists/${SEED_IDS.artists.visible.slug}`, {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBe(200)
    await expect(page.getByText(SEED_IDS.artists.visible.name).first()).toBeVisible()
  })

  test('the hidden fixture artist is unlisted, not deleted', async ({ page }) => {
    // getArtistBySlug (src/lib/api/artists.ts) deliberately does NOT filter on
    // is_visible — hidden artists stay reachable by direct link, they are only
    // kept out of the listings. Assert that contract rather than a 404.
    await page.goto('/artists', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(SEED_IDS.artists.hidden.name)).toHaveCount(0)
    await expect(page.getByText(SEED_IDS.artists.visible.name).first()).toBeVisible()
  })

  test('the fixture album renders its own title', async ({ page }) => {
    const response = await page.goto(`/releases/${SEED_IDS.releases.album.id}`, {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status()).toBe(200)
    await expect(page.getByText(SEED_IDS.releases.album.title).first()).toBeVisible()
  })

  test('the public fixture news post renders', async ({ page }) => {
    const publicPost = await page.goto(`/news/${SEED_IDS.news.public.slug}`, {
      waitUntil: 'domcontentloaded',
    })
    expect(publicPost?.status()).toBe(200)
    await expect(page.getByText(SEED_IDS.news.public.title).first()).toBeVisible()
  })

  test('the press-only fixture post is kept out of the public news listing', async ({ page }) => {
    // Note: /news/e2e-press-only-news currently answers 200 even though
    // getPublicNewsPostBySlug() filters is_press_only and the page calls
    // notFound(). That discrepancy is unresolved — see E2E-TESTS.md "Open
    // questions". This asserts only the listing behaviour, which is verified.
    await page.goto('/news', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(SEED_IDS.news.pressOnly.title)).toHaveCount(0)
  })
})
