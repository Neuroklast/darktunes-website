import { expect, type Page } from '@playwright/test'

export type TestUserRole = 'admin' | 'artist' | 'journalist'

export interface TestUserCredentials {
  email: string
  password: string
}

/** Reads fixture credentials without throwing — used only where a role is one
 * of several acceptable options (see getPressDashboardUser). */
function readTestUser(role: TestUserRole): TestUserCredentials | null {
  const prefix = role.toUpperCase()
  const email = process.env[`E2E_${prefix}_EMAIL`]
  const password = process.env[`E2E_${prefix}_PASSWORD`]

  if (!email || !password) return null
  return { email, password }
}

/** A DB is always available for E2E runs (see tests/e2e/global-setup.ts),
 * which seeds all three fixture accounts — so this throws instead of
 * returning null when credentials are unexpectedly missing. */
export function getTestUser(role: TestUserRole): TestUserCredentials {
  const creds = readTestUser(role)
  if (!creds) {
    const prefix = role.toUpperCase()
    throw new Error(
      `Missing E2E_${prefix}_EMAIL/E2E_${prefix}_PASSWORD — run \`npm run db:e2e:start\` to provision the local Supabase stack and fixture users.`,
    )
  }
  return creds
}

export async function loginAsAdmin(page: Page): Promise<void> {
  const creds = getTestUser('admin')

  // Centralized login lives at /login (legacy /admin/login and /portal/login are gone).
  // No ?returnTo= here: the login page ignores it for admin/artist roles (see
  // loginForPressDashboard's comment below) and it's actively dangerous as a query
  // string — a substring/regex match against the full URL matches "returnTo=/admin"
  // on the *pre-login* /login page itself, resolving waitForURL before the session
  // cookie is written. Matching on pathname avoids that trap entirely.
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(creds.email)
  await page.getByLabel(/password/i).first().fill(creds.password)
  await page.getByRole('button', { name: /sign in|login|anmelden/i }).first().click()

  await page.waitForURL((url) => /^\/admin(\/|$)/.test(url.pathname), { timeout: 20_000 })
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/admin(\/|$)/)
}

export function getPressDashboardUser(): TestUserCredentials {
  const creds = readTestUser('journalist') ?? readTestUser('admin')
  if (!creds) {
    throw new Error(
      'Missing E2E_JOURNALIST/E2E_ADMIN credentials — run `npm run db:e2e:start` to provision the local Supabase stack and fixture users.',
    )
  }
  return creds
}

export async function loginForPressDashboard(page: Page): Promise<void> {
  const creds = getPressDashboardUser()

  // Land on whatever the role's home is rather than passing
  // ?returnTo=/press/dashboard/press-kit: the login screen routes an
  // authenticated user to resolveRedirectPath(role) — /press/dashboard for a
  // journalist, /admin for the admin fallback — so insisting on the press-kit
  // URL here failed sign-in for a reason unrelated to the page under test,
  // and every follow-up goto then died with ERR_ABORTED. Callers navigate to
  // their own target afterwards.
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(creds.email)
  await page.getByLabel(/password/i).fill(creds.password)
  await page.getByRole('button', { name: /sign in/i }).click()

  await page.waitForURL(/\/(press\/dashboard|admin)(\/|\?|$)/, { timeout: 15_000 })
  await expect(page).toHaveURL(/\/(press\/dashboard|admin)(\/|\?|$)/)
}

export async function loginAsArtist(page: Page): Promise<void> {
  const creds = getTestUser('artist')

  // No ?returnTo= here — same reasoning as loginAsAdmin above: the login page
  // ignores it for this role, and as a query string it can falsely satisfy a
  // URL-substring/regex wait on the pre-login /login page itself. Matching on
  // pathname (below) avoids that trap entirely.
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(/email/i).fill(creds.email)
  await page.getByLabel(/password/i).first().fill(creds.password)
  await page.getByRole('button', { name: /sign in|login|anmelden/i }).first().click()

  // Onboarding gate may send incomplete profiles to /portal/onboarding — fixture
  // artist is seeded complete so we expect the overview (or any /portal/*).
  await page.waitForURL((url) => /^\/portal(\/|$)/.test(url.pathname), { timeout: 20_000 })
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/portal(\/|$)/)
}
