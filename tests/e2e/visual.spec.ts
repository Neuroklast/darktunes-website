/**
 * tests/e2e/visual.spec.ts — Visual Regression Tests
 *
 * Captures baseline screenshots for the main page, the artist overview
 * section, the press page, and the newsletter confirmation page.
 *
 * CRT / noise / scanline effects are disabled before every screenshot via
 * CSS injection so that animated noise does not produce flaky diffs.
 * Framer Motion animations are frozen at their final state by overriding the
 * prefers-reduced-motion media feature (set in playwright.config.ts via
 * `reducedMotion: 'reduce'`) and by forcibly completing WAAPI animations.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { waitForPageSettled } from '../helpers/pageSettle'

const snapshotsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'visual.spec.ts-snapshots')
const hasVisualBaselines =
  fs.existsSync(snapshotsDir) && fs.readdirSync(snapshotsDir).some((f) => f.endsWith('.png'))

// Baselines are platform-specific and not always committed; skip rather than fail CI.
test.beforeEach(({}, testInfo) => {
  if (!hasVisualBaselines) {
    testInfo.skip(true, 'No visual.spec.ts-snapshots baselines present — generate with npx playwright test --update-snapshots')
  }
})

// ---------------------------------------------------------------------------
// Helper: inject CSS that neutralises all dynamic visual effects
// ---------------------------------------------------------------------------
async function disableDynamicEffects(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      /* Hide CRT / noise / vignette overlays */
      .noise-overlay,
      .scanlines-overlay,
      [style*="radial-gradient(ellipse at center"] {
        display: none !important;
      }

      /* Freeze all CSS animations & transitions */
      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }

      /* Freeze Framer Motion transforms at their resting state */
      [data-framer-motion] {
        transform: none !important;
        opacity: 1 !important;
      }
    `,
  })

  // Finish any in-flight WAAPI animations so the DOM settles.
  await page.evaluate(() => {
    document.getAnimations().forEach((a) => a.finish())
  })
}

// ---------------------------------------------------------------------------
// Helper: wait for images (lazy-loaded via Intersection Observer) to settle
// ---------------------------------------------------------------------------
async function waitForImages(page: Page): Promise<void> {
  await waitForPageSettled(page)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Visual Regression — Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForImages(page)
    await disableDynamicEffects(page)
  })

  test('matches full-page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('home-full.png', {
      fullPage: true,
      // Allow a small pixel-level tolerance for anti-aliasing differences
      // between headless rendering environments.
      maxDiffPixelRatio: 0.02,
    })
  })

  test('matches hero section snapshot', async ({ page }) => {
    const hero = page.locator('#hero')
    await hero.waitFor({ state: 'visible' })
    await expect(hero).toHaveScreenshot('home-hero.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})

test.describe('Visual Regression — Artists section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForImages(page)
    await disableDynamicEffects(page)
  })

  test('matches artists grid snapshot', async ({ page }) => {
    const section = page.locator('#artists')
    // The section may not exist when Supabase is unavailable; skip gracefully.
    const count = await section.count()
    if (count === 0) {
      test.skip(true, '#artists section not present (no Supabase data)')
      return
    }
    await section.scrollIntoViewIfNeeded()
    await expect(section).toHaveScreenshot('home-artists.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})

test.describe('Visual Regression — Releases section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForImages(page)
    await disableDynamicEffects(page)
  })

  test('matches releases grid snapshot', async ({ page }) => {
    const section = page.locator('section#releases').first()
    const count = await section.count()
    if (count === 0) {
      test.skip(true, '#releases section not present (no Supabase data)')
      return
    }
    await section.scrollIntoViewIfNeeded()
    await expect(section).toHaveScreenshot('home-releases.png', {
      maxDiffPixelRatio: 0.02,
    })
  })
})

test.describe('Visual Regression — Press page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/press')
    await waitForImages(page)
    await disableDynamicEffects(page)
  })

  test('matches press page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('press-full.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    })
  })
})

test.describe('Visual Regression — Newsletter confirmed page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/newsletter/confirmed')
    await waitForImages(page)
    await disableDynamicEffects(page)
  })

  test('matches newsletter-confirmed snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('newsletter-confirmed.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    })
  })
})
