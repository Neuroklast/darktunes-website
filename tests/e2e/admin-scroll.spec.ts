import { expect, test } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth'

test.describe('Admin table wheel scroll', () => {
  test('submission form table scrolls vertically with mouse wheel over a row', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/submission-form', { waitUntil: 'domcontentloaded' })

    // Scoped to `main`: AdminSidebarNav's own nav list also carries
    // `data-lenis-prevent` + `overflow-y-auto` (see AdminSidebarNav.tsx), so the
    // unscoped selector's `.first()` matched the sidebar instead of this pane.
    const scrollPane = page.locator('main [data-lenis-prevent].overflow-y-auto').first()
    await expect(scrollPane).toBeVisible({ timeout: 15_000 })

    const tableRow = page.locator('table tbody tr').first()
    await expect(tableRow).toBeVisible({ timeout: 15_000 })

    // Force the pane to overflow. The contract under test is that a wheel
    // event over a table row reaches the scroll container instead of being
    // swallowed by Lenis — not that this page happens to be taller than the
    // viewport. At the project's 1920×1080 the section's content fits, so
    // scrollTop stayed 0 and the contract was never actually exercised.
    // Height 400 is too short for this page specifically: its extra
    // form/track-limit sub-tabs push the AdminListShell pane's flex-1 area
    // to a collapsed 0px clientHeight, leaving nothing to scroll.
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect
      .poll(async () => scrollPane.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeGreaterThan(0)

    const before = await scrollPane.evaluate((el) => el.scrollTop)
    const rowBox = await tableRow.boundingBox()
    expect(rowBox).not.toBeNull()

    await page.mouse.move(rowBox!.x + rowBox!.width / 2, rowBox!.y + rowBox!.height / 2)
    await page.mouse.wheel(0, 600)

    await expect
      .poll(async () => scrollPane.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(before)
  })
})