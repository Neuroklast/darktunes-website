import { test, expect } from '@playwright/test'
import { getTestUser, loginAsAdmin } from '../helpers/auth'
import { getVisibleArtists, isSupabaseE2EConfigured } from '../helpers/supabase'

/** Tabs on `/admin` (AdminDashboard TAB_DEFS). */
const ADMIN_DASHBOARD_TABS = [
  'Artists',
  'Releases',
  'News',
  'Videos',
  'Events',
  'Genres',
  'Assets',
  'Accreditations',
  'Press Portal',
  'Statements',
  'Release Submissions',
  'Video Submissions',
  'Promo Log',
  'Submission Form',
  'Maintenance',
]

/** Sidebar-only routes (AdminSidebarNav) — not dashboard tabs. */
const ADMIN_SIDEBAR_LINKS = [
  'Dashboard',
  'Submission Form',
  'Tour Planner',
  'Accounting',
  'Label Intelligence',
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
    if (!isSupabaseE2EConfigured()) {
      test.skip(true, 'Supabase env missing for artist route checks')
      return
    }

    const artists = await getVisibleArtists(1)
    if (artists.length === 0) {
      test.skip(true, 'No visible artist found')
      return
    }

    await page.goto(`/artists/${artists[0].slug}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/full bio|bio|biografie/i).first()).toBeVisible()
    await expect(page.getByText(/releases|veröffentlichungen/i).first()).toBeVisible()
    await expect(page.getByText(/concerts|konzerte|shows/i).first()).toBeVisible()
  })

  test('admin dashboard tabs are visible for admin role', async ({ page }) => {
    if (!getTestUser('admin')) {
      test.skip(true, 'Missing E2E admin credentials')
      return
    }

    await loginAsAdmin(page)

    for (const tabLabel of ADMIN_DASHBOARD_TABS) {
      await expect(page.getByRole('tab', { name: tabLabel })).toBeVisible()
    }
  })

  test('admin sidebar links are visible for admin role', async ({ page }) => {
    if (!getTestUser('admin')) {
      test.skip(true, 'Missing E2E admin credentials')
      return
    }

    await loginAsAdmin(page)

    const nav = page.getByRole('navigation', { name: 'Admin sections' })
    for (const linkLabel of ADMIN_SIDEBAR_LINKS) {
      await expect(nav.getByRole('link', { name: linkLabel })).toBeVisible()
    }
  })

  test('admin features page shows global and portal sections', async ({ page }) => {
    if (!getTestUser('admin')) {
      test.skip(true, 'Missing E2E admin credentials')
      return
    }

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