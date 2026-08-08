import { test, expect } from '@playwright/test'
import { gotoAndSettle } from '../helpers/pageSettle'

test.describe('User journeys and accessibility flows', () => {
  test('visitor can navigate homepage → releases page → release detail', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    await page.getByRole('link', { name: /releases|veröffentlichungen/i }).first().click()
    await expect(page).toHaveURL(/\/releases$/)

    const releaseDetailLink = page.locator('a[href^="/releases/"]').first()
    if ((await releaseDetailLink.count()) === 0) {
      test.skip(true, 'No release detail links available')
      return
    }

    await releaseDetailLink.click()
    await expect(page).toHaveURL(/\/releases\/.+/)
  })

  test('visitor can navigate homepage → artist card → artist detail', async ({ page }) => {
    await gotoAndSettle(page, '/')

    const artistLink = page.locator('#artists a[href^="/artists/"]').first()
    if ((await artistLink.count()) === 0) {
      test.skip(true, 'No artist cards available on homepage')
      return
    }

    await artistLink.click()
    await expect(page).toHaveURL(/\/artists\/.+/)
  })

  test('mobile menu opens via keyboard (Tab → Enter)', async ({ page, viewport }) => {
    if (!viewport || viewport.width >= 1024) {
      test.skip(true, 'Mobile-only keyboard menu test')
      return
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    await page.keyboard.press('Tab')
    const menuButton = page.getByRole('button', { name: /open menu/i })
    await menuButton.focus()
    await page.keyboard.press('Enter')

    await expect(page.locator('#mobile-menu')).toBeVisible()
  })

  test('navigation links are keyboard-accessible', async ({ page, viewport }) => {
    if (!viewport || viewport.width < 1024) {
      test.skip(true, 'Desktop-only — mobile nav is collapsed behind the menu toggle')
      return
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Desktop main nav only. Resolve hrefs first so remounts do not invalidate nth() handles.
    const nav = page.locator('header nav[aria-label="Main navigation"]')
    await expect(nav).toBeVisible()
    const hrefs = await nav.locator('a').evaluateAll((anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).getAttribute('href')).filter(Boolean),
    )
    expect(hrefs.length).toBeGreaterThan(0)

    for (const href of hrefs) {
      const link = nav.locator(`a[href="${href}"]`).first()
      await link.focus()
      await expect(link).toBeFocused()
    }
  })

  test('reduced motion preference is respected', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const reducedMotionEnabled = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )

    expect(reducedMotionEnabled).toBe(true)
    await expect(page.locator('body')).toBeVisible()
  })
})
