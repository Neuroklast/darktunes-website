import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsArtist } from '../helpers/auth'

test.describe('Tour planner — API security', () => {
  test('portal tour-planner endpoints reject unauthenticated requests', async ({ request }) => {
    const tours = await request.get('/api/portal/tour-planner/tours?artistId=00000000-0000-0000-0000-000000000001')
    expect(tours.status()).toBe(401)

    const stops = await request.get('/api/portal/tour-planner/stops?artistId=00000000-0000-0000-0000-000000000001&tourId=00000000-0000-0000-0000-000000000002')
    expect(stops.status()).toBe(401)

    const tasks = await request.post('/api/portal/tour-planner/tasks?artistId=00000000-0000-0000-0000-000000000001', {
      data: { title: 'E2E', dueDate: '2026-12-01' },
    })
    expect(tasks.status()).toBe(401)
  })
})

test.describe('Tour planner — route access', () => {
  test('unauthenticated users are redirected from portal tour planner', async ({ page }) => {
    await page.goto('/portal/tour-planner', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/)
    expect(page.url()).toContain('returnTo')
  })
})

test.describe('Tour planner — portal UI', () => {
  test('artist can open tour planner when configured', async ({ page }) => {
    await loginAsArtist(page)
    await page.goto('/portal/tour-planner', { waitUntil: 'domcontentloaded' })

    // Artist-facing UI calls this "Tour Production" (admin's read-only view
    // below still says "Tour Planner" — see tests/e2e/tour-planner.spec.ts:42).
    await expect(
      page.getByRole('heading', { name: /tour (planner|production)|tourplaner/i, level: 1 }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /advanced/i })).toBeVisible()
  })
})

test.describe('Tour planner — admin read-only', () => {
  test('admin can open tour planner overview', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/tour-planner', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Tour Planner', level: 1 })).toBeVisible()
    await expect(page.getByLabel(/artist|künstler/i)).toBeVisible()
  })
})