import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginForPressDashboard } from '../helpers/auth'
import { gotoAndSettle } from '../helpers/pageSettle'

test.describe('Press kit — API security', () => {
  test('admin press-kit endpoints reject unauthenticated requests', async ({ request }) => {
    const getResponse = await request.get('/api/admin/press-kit?artistId=label')
    expect(getResponse.status()).toBe(401)

    const postResponse = await request.post('/api/admin/press-kit', {
      data: { assetId: '00000000-0000-0000-0000-000000000001' },
    })
    expect(postResponse.status()).toBe(401)

    const reorderResponse = await request.patch('/api/admin/press-kit/reorder', {
      data: { orderedItemIds: ['kit-item-1'] },
    })
    expect(reorderResponse.status()).toBe(401)
  })

  test('bulk-press endpoint rejects unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/admin/assets/bulk-press', {
      data: { assetIds: ['asset-1'], action: 'approve' },
    })
    expect(response.status()).toBe(401)
  })
})

test.describe('Press kit — route access', () => {
  test('unauthenticated users are redirected from journalist press kit dashboard', async ({ page }) => {
    await page.goto('/press/dashboard/press-kit', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/)
    expect(page.url()).toContain('returnTo')
  })
})

test.describe('Press kit — admin builder', () => {
  test('admin can open the Press Kit builder tab', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/press', { waitUntil: 'domcontentloaded' })

    await page.getByRole('tab', { name: 'Press Kit' }).click()

    await expect(page.getByText('Press Kit Builder')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Press kit scope' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add asset' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse press assets' })).toHaveAttribute(
      'href',
      '/admin/assets?pressOnly=1',
    )
  })

  test('admin press kit tab shows empty state or curated items', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/press', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: 'Press Kit' }).click()

    const emptyState = page.getByText(/No assets in this kit yet/i)
    const itemCard = page.locator('ul li').filter({ has: page.getByRole('button', { name: /Remove/i }) }).first()

    await expect(emptyState.or(itemCard)).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Press kit — journalist dashboard', () => {
  test('press dashboard renders the press kit page for authorized users', async ({ page }) => {
    await loginForPressDashboard(page)
    await page.goto('/press/dashboard/press-kit', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: /press kit/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /download all as zip/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /all/i })).toBeVisible()
  })

  test('press photo lightbox opens and closes when kit images exist', async ({ page }) => {
    await loginForPressDashboard(page)
    await gotoAndSettle(page, '/press/dashboard/press-kit')

    const viewButton = page.getByRole('button', { name: /^View /i }).first()
    const hasImages = await viewButton.isVisible().catch(() => false)
    if (!hasImages) {
      test.skip(true, 'No press kit images available in this environment')
      return
    }

    await viewButton.click()
    await expect(page.getByRole('button', { name: 'Close press photo viewer' })).toBeVisible()

    await page.getByRole('button', { name: 'Close press photo viewer' }).click()
    await expect(page.getByRole('button', { name: 'Close press photo viewer' })).toBeHidden()
  })

  test('lightbox next control advances when multiple images exist', async ({ page }) => {
    await loginForPressDashboard(page)
    await gotoAndSettle(page, '/press/dashboard/press-kit')

    const viewButtons = page.getByRole('button', { name: /^View /i })
    const count = await viewButtons.count()
    if (count < 2) {
      test.skip(true, 'Need at least two press kit images for navigation test')
      return
    }

    await viewButtons.first().click()
    const nextButton = page.getByRole('button', { name: 'Next photo' })
    await expect(nextButton).toBeEnabled()
    await nextButton.click()
    await expect(page.getByText(/2 \/ 2/)).toBeVisible()
  })
})