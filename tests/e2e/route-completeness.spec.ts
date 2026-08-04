import { test, expect } from '@playwright/test'

const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/artists',
  '/releases',
  '/news',
  '/contact',
  '/press',
  '/offline',
  '/impressum',
  '/datenschutz',
  '/agb',
]
const PROTECTED_PREFIXES = ['/admin/', '/portal/', '/press/dashboard/', '/promo-pool/']
const MAX_CRAWL_PAGES = 100

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function normalizeInternalPath(href: string, baseURL: string): string | null {
  if (!href) {
    return null
  }

  const url = new URL(href, baseURL)
  if (!['http:', 'https:'].includes(url.protocol)) return null

  const appOrigin = new URL(baseURL).origin
  if (url.origin !== appOrigin) return null

  const path = `${url.pathname}${url.search}`
  if (path.startsWith('/_next') || path.startsWith('/api/')) return null
  if (isProtectedPath(url.pathname)) return null

  return path
}

test.describe('Route completeness', () => {
  test('all known public static routes respond without 404', async ({ request }) => {
    // Legal pages + homepage SSR can be cold in CI; allow headroom beyond default 30s.
    test.setTimeout(90_000)
    for (const route of PUBLIC_ROUTES) {
      const response = await request.get(route, { timeout: 20_000 })
      expect(response.status(), `${route} should return HTTP 200`).toBe(200)
    }
  })

  test('crawler visits internal links and verifies HTTP 200 responses', async ({ page, baseURL }) => {
    const appBaseURL = baseURL ?? 'http://localhost:3000'
    const queue = ['/']
    const visited = new Set<string>()

    while (queue.length > 0 && visited.size < MAX_CRAWL_PAGES) {
      const currentPath = queue.shift()
      if (!currentPath || visited.has(currentPath)) continue

      const response = await page.goto(currentPath, { waitUntil: 'domcontentloaded' })
      visited.add(currentPath)

      expect(response?.status(), `Crawled path should return 200: ${currentPath}`).toBe(200)

      const hrefs = await page.locator('a[href]').evaluateAll((elements) =>
        elements
          .map((el) => el.getAttribute('href'))
          .filter((href): href is string => Boolean(href)),
      )

      for (const href of hrefs) {
        const path = normalizeInternalPath(href, appBaseURL)
        if (!path || visited.has(path) || queue.includes(path)) continue
        if (queue.length + visited.size >= MAX_CRAWL_PAGES) break
        queue.push(path)
      }
    }

    expect(visited.size).toBeGreaterThan(0)
  })
})
