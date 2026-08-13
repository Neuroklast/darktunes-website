import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from '../helpers/auth'
import { waitForPageSettled } from '../helpers/pageSettle'

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Critical error', { exact: false })).toHaveCount(0)
}

test.describe('Admin SOS drafts + statements', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('statement history tab mounts without the app error boundary', async ({ page }) => {
    await page.goto('/admin/accounting', { waitUntil: 'domcontentloaded' })
    await waitForPageSettled(page)
    await expect(page.getByRole('heading', { name: /accounting/i })).toBeVisible()

    await page.getByRole('tab', { name: /statement history|statement-historie|historique/i }).click()
    await waitForPageSettled(page)
    await expect(page.getByRole('heading', { name: /statement history|historie|historique/i })).toBeVisible()
    await expectNoErrorBoundary(page)
  })

  test('/admin/statements lists drafts without crashing', async ({ page }) => {
    await page.goto('/admin/statements', { waitUntil: 'domcontentloaded' })
    await waitForPageSettled(page)
    await expect(page.getByRole('heading', { name: /statements/i })).toBeVisible()
    await expectNoErrorBoundary(page)
  })

  test('guided publish / drafts step does not trip the error boundary', async ({ page }) => {
    await page.goto('/admin/accounting?guidedStep=settle', { waitUntil: 'domcontentloaded' })
    await waitForPageSettled(page)
    await expectNoErrorBoundary(page)
    await expect(page.getByRole('heading', { name: /accounting/i })).toBeVisible()
  })
})
