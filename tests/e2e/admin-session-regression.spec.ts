import { expect, test } from '@playwright/test'
import { getTestUser, loginAsAdmin } from '../helpers/auth'

test('admin login recovers from a stale unauthorized URL without clearing cookies', async ({ page }) => {
  const credentials = getTestUser('admin')

  await page.goto('/login?error=unauthorized', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(credentials.email)
  await page.getByLabel(/password/i).first().fill(credentials.password)
  await page.getByRole('button', { name: /sign in|login|anmelden/i }).first().click()

  await page.waitForURL((url) => url.pathname === '/admin', { timeout: 20_000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/admin$/)
})

test('an already signed-in admin escapes an old unauthorized URL', async ({ page }) => {
  await loginAsAdmin(page)

  await page.goto('/login?error=unauthorized', { waitUntil: 'domcontentloaded' })

  await expect(page).toHaveURL(/\/admin$/)
})
