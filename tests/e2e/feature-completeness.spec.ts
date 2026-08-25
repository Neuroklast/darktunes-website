import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth'
import { getVisibleArtists } from '../helpers/supabase'

/** Content stat cards on `/admin` (AdminOverview's "Content at a glance"). */
const ADMIN_OVERVIEW_STATS = ['Artists', 'Releases', 'News', 'Videos']

/** Quick-access section links on `/admin` (AdminOverview's SECTION_LINKS). */
const ADMIN_OVERVIEW_SECTIONS = [
  'Content',
  'Accounting',
  'Messages',
  'Users',
  'Feature Flags',
  'Settings',
  'System',
]

/** Sidebar-only routes (AdminSidebarNav) — not dashboard tabs. Labels = admin.nav (en). */
const ADMIN_SIDEBAR_LINKS = [
  'Dashboard',
  'Submission Form',
  'Tour Production',
  'Accounting',
  'Analytics',
  'Messages',
  'Users',
  'Feature Flags',
  'Colors',
  'Settings',
  'API Keys',
  'Support',
  'System',
  'Genres',
]

test.describe('Feature completeness', () => {
  test('homepage key sections are visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#hero')).toBeVisible()
    await expect(page.locator('section#releases, #releases').first()).toBeVisible()
    await expect(page.locator('section#news, #news').first()).toBeVisible()
    // Artists live on /artists (not a homepage section id in DEFAULT_SECTION_ORDER)
    await page.goto('/artists', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main, h1').first()).toBeVisible()
  })

  test('artist detail shows bio, releases, and concerts sections', async ({ page }) => {
    const artists = await getVisibleArtists(1)
    if (artists.length === 0) {
      test.skip(true, 'No visible artist found')
      return
    }

    await page.goto(`/artists/${artists[0].slug}`, { waitUntil: 'domcontentloaded' })

    // Scope to #main-content (the skip-link target; this page has no <main>
    // landmark): the site header's "RELEASES" nav link also matches the releases
    // regex and sits earlier in the DOM than the page content, so an unscoped
    // .first() grabs it instead of the artist page's own section. On mobile that
    // header link is CSS-hidden (replaced by the hamburger menu), so the mismatch
    // only broke there — on desktop it happened to be visible too, masking the
    // wrong-element pick. The releases section itself is headed "Discography"
    // (src/i18n/messages/en/artistDetail.json), not "Releases" — broaden the
    // regex to match the real heading now that the header decoy is excluded.
    const content = page.locator('#main-content')
    await expect(content.getByText(/full bio|bio|biografie/i).first()).toBeVisible()
    await expect(
      content.getByText(/releases|discography|diskografie|veröffentlichungen/i).first(),
    ).toBeVisible()
    await expect(content.getByText(/concerts|konzerte|shows/i).first()).toBeVisible()
  })

  test('admin overview shows content stats and quick-access sections for admin role', async ({ page }) => {
    await loginAsAdmin(page)

    const stats = page.getByRole('region', { name: 'Content statistics' })
    for (const statLabel of ADMIN_OVERVIEW_STATS) {
      await expect(stats.getByText(statLabel, { exact: true })).toBeVisible()
    }

    const sections = page.getByRole('region', { name: 'Admin sections' })
    for (const sectionLabel of ADMIN_OVERVIEW_SECTIONS) {
      await expect(sections.getByRole('link', { name: sectionLabel })).toBeVisible()
    }
  })

  test('admin sidebar links are visible for admin role', async ({ page, isMobile }) => {
    await loginAsAdmin(page)
    // Force English so assertions match admin.nav en strings (default locale is de).
    const origin = new URL(page.url()).origin
    await page.context().addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: origin },
    ])
    await page.reload({ waitUntil: 'domcontentloaded' })

    // AdminSidebarNav's persistent sidebar is CSS-hidden below md; on mobile the
    // same <nav> only becomes visible inside the Sheet drawer once the hamburger
    // is opened.
    if (isMobile) {
      await page.getByRole('button', { name: 'Open admin navigation' }).click()
    }

    const nav = page.getByRole('navigation', { name: 'Admin sections' })
    for (const linkLabel of ADMIN_SIDEBAR_LINKS) {
      await expect(nav.getByRole('link', { name: linkLabel })).toBeVisible()
    }
  })

  test('admin features page shows global and portal sections', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/features', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Global site toggles' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Portal module flags' })).toBeVisible()
    await expect(page.getByText('Promo Pool').first()).toBeVisible()
    await expect(page.getByText('Editor Tools').first()).toBeVisible()
  })

  test('newsletter section embeds the Shopify signup iframe', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const newsletter = page.locator('section#newsletter').first()
    await expect(newsletter).toBeVisible()
    await expect(newsletter.locator('iframe[title]')).toBeVisible()
  })
})