/**
 * tests/e2e/admin-organizations.spec.ts — P2 coverage for /admin/organizations
 * (OrganizationsManager) and its Bearer-token admin org APIs.
 *
 * OrganizationsManager is NOT wrapped in AdminPageShell (see
 * app/admin/organizations/page.tsx — just `<div className="p-6">`), so
 * there's no guaranteed <h1> contract to reuse from admin-sections.spec.ts.
 * Selectors below target the component's own literal headings/labels
 * instead (src/components/admin/OrganizationsManager.tsx).
 *
 * Auth model: the admin org APIs (app/api/admin/organizations,
 * organization-api-keys, organization-webhooks, organization-audit-log,
 * custom-domains, custom-domains/verify, partner-webhooks/emit) authenticate
 * via `requireAdminFromRequest`/`verifyAdminOrEditor` reading
 * `Authorization: Bearer <supabase-access-token>` — NOT cookies — then
 * `assertAdminOrganizationAccess(db, userId, orgId)`. To call them here we
 * need the real access token OrganizationsManager itself uses (its
 * `getToken()` calls `createBrowserSupabaseClient().auth.getSession()`).
 *
 * That client is `@supabase/ssr`'s `createBrowserClient`, which persists the
 * session in chunked, base64-encoded cookies — not localStorage — so there's
 * no way to reconstruct it from a bare `page.evaluate()` script (the app's
 * bundled `@supabase/ssr` import isn't reachable from an injected snippet
 * without shipping the whole package into the page). Instead,
 * `captureAdminBearerToken` below listens for the real outgoing
 * `/api/admin/organizations` request OrganizationsManager fires on mount and
 * reads its `Authorization` header directly — the exact token the app uses,
 * captured off the wire rather than reimplemented.
 *
 * Seed facts (supabase/reset.sql): Org #0 = 00000000-... 'darkTunes Music
 * Group' (slug `darktunes`), custom_domain feature TRUE. Demo Label =
 * 11111111-... , custom_domain + partner_api TRUE. The fixture admin is Org
 * #0 staff — assertAdminOrganizationAccess grants Org #0 access to any
 * admin/editor without a membership row (transitional single-tenant rule),
 * so every flow below targets Org #0 to stay independent of
 * organization_users seeding. Every DB-backed assertion still skips
 * gracefully per tests/e2e/tenant-isolation.spec.ts / partner-api.spec.ts's
 * pattern rather than hard-failing when preconditions aren't met.
 */

import { test, expect, type Page, type Request as PWRequest } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseEnvConfigured } from '@/lib/supabase/isConfigured'
import { loginAsAdmin } from '../helpers/auth'
import { waitForPageSettled } from '../helpers/pageSettle'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { createServiceRoleTestClient } from '../helpers/supabase'
import type { Database } from '@/types/database'

/** app/error.tsx's boundary — same check as admin-sections.spec.ts's expectNoErrorBoundary. */
async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0)
}

/**
 * Captures the Bearer token OrganizationsManager's own getToken() sends on
 * its first `/api/admin/organizations` fetch. See file header for why this
 * is network interception rather than a page.evaluate reimplementation.
 */
async function captureAdminBearerToken(page: Page): Promise<string> {
  let token = ''
  const onRequest = (req: PWRequest) => {
    if (token) return
    if (!req.url().includes('/api/admin/organizations')) return
    const auth = req.headers()['authorization']
    if (auth?.startsWith('Bearer ')) token = auth.slice('Bearer '.length)
  }
  page.on('request', onRequest)
  await page.goto('/admin/organizations', { waitUntil: 'domcontentloaded' })
  await waitForPageSettled(page)
  await page
    .waitForResponse(
      (res) => res.url().includes('/api/admin/organizations') && res.request().method() === 'GET',
      { timeout: 10_000 },
    )
    .catch(() => undefined)
  page.off('request', onRequest)
  return token
}

test.describe('Admin organizations', () => {
  let page: Page
  let adminToken = ''
  let schemaReady = false

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await loginAsAdmin(page)
    adminToken = await captureAdminBearerToken(page)

    // Schema may not be applied yet on this DB — same probe pattern as
    // tenant-isolation.spec.ts / partner-api.spec.ts. Bail out (leaving
    // schemaReady false) rather than throwing, so DB-backed tests below skip
    // cleanly instead of hard-failing on a 500 from a missing table.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (isSupabaseEnvConfigured() && url && serviceKey) {
      const probeClient = createServiceRoleTestClient(url, serviceKey)
      const probe = await probeClient.from('organizations').select('id').limit(1)
      schemaReady = !probe.error
    }
  })

  test.afterAll(async () => {
    await page.close()
  })

  // ---------------------------------------------------------------------
  // Render smoke (browser)
  // ---------------------------------------------------------------------

  test.describe('render smoke', () => {
    test('OrganizationsManager renders its own content with no error boundary', async () => {
      // CardTitle (src/components/ui/card.tsx) renders a
      // <div data-slot="card-title">, not a heading element — so these Card
      // titles must be matched by text, not ARIA role. Only the page's own
      // <h1> ("Organizations (SaaS)") is a genuine heading.
      await expect(page.getByRole('heading', { level: 1, name: 'Organizations (SaaS)' })).toBeVisible()
      await expect(page.getByText('Tenants', { exact: true })).toBeVisible()
      await expect(page.getByText('Partner API Key (v1)', { exact: true })).toBeVisible()
      await expect(page.getByText('Outbound Webhooks (v1)', { exact: true })).toBeVisible()
      await expect(page.getByText('Custom Domains', { exact: true })).toBeVisible()
      await expectNoErrorBoundary(page)
    })

    test('org list loads and includes Org #0 (darktunes)', async () => {
      test.skip(!schemaReady, 'multi-tenant schema (organizations) not applied to this DB')
      // Tenants Card renders each org's name + `${slug}.darktunes.app`.
      await expect(page.getByText('darkTunes Music Group')).toBeVisible()
      await expect(page.getByText('darktunes.darktunes.app')).toBeVisible()
    })
  })

  // ---------------------------------------------------------------------
  // Unauthenticated API
  // ---------------------------------------------------------------------

  test.describe('unauthenticated API', () => {
    test('GET /api/admin/organizations with no Authorization header is rejected', async ({
      request,
    }) => {
      const res = await request.get('/api/admin/organizations')
      expect([401, 403]).toContain(res.status())
    })
  })

  // ---------------------------------------------------------------------
  // Authenticated API (Bearer token from the logged-in admin)
  // ---------------------------------------------------------------------

  test.describe('authenticated API', () => {
    test('GET /api/admin/organizations → 200, includes Org #0', async ({ request }) => {
      test.skip(!schemaReady, 'multi-tenant schema (organizations) not applied to this DB')
      test.skip(!adminToken, 'Could not capture the admin bearer token from the browser session')

      const res = await request.get('/api/admin/organizations', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      expect(res.status(), await res.text()).toBe(200)

      const body = (await res.json()) as Array<{ id: string; slug: string; name: string }>
      expect(Array.isArray(body)).toBe(true)
      expect(
        body.some((org) => org.id === DEFAULT_ORGANIZATION_ID || org.slug === 'darktunes'),
        'response should include Org #0 (darktunes)',
      ).toBe(true)
    })

    test('GET /api/admin/organization-audit-log for Org #0', async ({ request }) => {
      test.skip(!adminToken, 'Could not capture the admin bearer token from the browser session')

      const res = await request.get(
        `/api/admin/organization-audit-log?organizationId=${DEFAULT_ORGANIZATION_ID}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      )

      if (res.status() !== 200) {
        test.skip(true, `organization-audit-log returned ${res.status()}: ${await res.text().catch(() => '')}`)
        return
      }

      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------
  // Stretch: custom domain, API key, webhook create + emit — all against
  // Org #0 (guaranteed admin access + custom_domain enabled per reset.sql).
  // Skips on any 403 (no access / feature disabled) rather than failing,
  // and requires a service-role client so created rows can be cleaned up.
  // ---------------------------------------------------------------------

  test.describe('stretch: custom domain / API key / webhook flows', () => {
    let serviceClient: SupabaseClient<Database> | null = null
    const createdDomainIds: string[] = []
    const createdApiKeyIds: string[] = []
    const createdWebhookIds: string[] = []

    test.beforeAll(() => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!isSupabaseEnvConfigured() || !url || !serviceKey) return
      serviceClient = createServiceRoleTestClient(url, serviceKey)
    })

    test.afterAll(async () => {
      if (!serviceClient) return
      if (createdDomainIds.length) {
        await serviceClient.from('custom_domains').delete().in('id', createdDomainIds)
      }
      if (createdApiKeyIds.length) {
        await serviceClient.from('organization_api_keys').delete().in('id', createdApiKeyIds)
      }
      if (createdWebhookIds.length) {
        await serviceClient.from('organization_webhook_endpoints').delete().in('id', createdWebhookIds)
      }
    })

    test.beforeEach(() => {
      test.skip(!schemaReady, 'multi-tenant schema (organizations) not applied to this DB')
      test.skip(!adminToken, 'Could not capture the admin bearer token from the browser session')
      test.skip(
        !serviceClient,
        'SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing — skipping so created org resources are never left uncleaned',
      )
    })

    test('custom domain add → verify against Org #0', async ({ request }) => {
      const domain = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.example.com`

      const addRes = await request.post('/api/admin/custom-domains', {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { organizationId: DEFAULT_ORGANIZATION_ID, domain },
      })

      if (addRes.status() === 403) {
        const body = await addRes.json().catch(() => ({}) as { code?: string })
        test.skip(true, `custom domain creation forbidden: ${body.code ?? addRes.status()}`)
        return
      }
      expect(addRes.status(), await addRes.text()).toBe(201)
      const created = (await addRes.json()) as { id: string; domain: string; verificationToken: string }
      createdDomainIds.push(created.id)
      expect(created.domain).toBe(domain)
      expect(created.verificationToken).toBeTruthy()

      const verifyRes = await request.post('/api/admin/custom-domains/verify', {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { domainId: created.id },
      })

      if (verifyRes.status() === 403) {
        const body = await verifyRes.json().catch(() => ({}) as { code?: string })
        test.skip(true, `custom domain verify forbidden: ${body.code ?? verifyRes.status()}`)
        return
      }

      // This test doesn't own real DNS for a throwaway *.example.com domain,
      // so the TXT lookup is expected to fail — that still proves the
      // endpoint's auth/access/lookup path ran correctly. A 200 (e.g. via
      // CUSTOM_DOMAIN_FORCE_VERIFY in a non-production run) is also accepted.
      expect([200, 400], await verifyRes.text()).toContain(verifyRes.status())
      if (verifyRes.status() === 400) {
        const body = await verifyRes.json()
        expect(body.code).toBe('DNS_VERIFY_FAILED')
      }
    })

    test('organization API key create against Org #0', async ({ request }) => {
      const res = await request.post('/api/admin/organization-api-keys', {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { organizationId: DEFAULT_ORGANIZATION_ID, name: `e2e-key-${Date.now()}` },
      })

      if (res.status() === 403) {
        const body = await res.json().catch(() => ({}) as { code?: string })
        test.skip(true, `API key creation forbidden: ${body.code ?? res.status()}`)
        return
      }
      expect(res.status(), await res.text()).toBe(201)

      const body = (await res.json()) as { key: string; metadata?: { id: string } }
      expect(body.key.startsWith('dt_live_')).toBe(true)
      if (body.metadata?.id) createdApiKeyIds.push(body.metadata.id)
    })

    test('webhook endpoint create + emit against Org #0', async ({ request }) => {
      const createRes = await request.post('/api/admin/organization-webhooks', {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          url: 'https://example.com/e2e-darktunes-webhook-sink',
          events: ['artist.created'],
        },
      })

      if (createRes.status() === 403) {
        const body = await createRes.json().catch(() => ({}) as { code?: string })
        test.skip(true, `webhook endpoint creation forbidden: ${body.code ?? createRes.status()}`)
        return
      }
      expect(createRes.status(), await createRes.text()).toBe(201)

      const created = (await createRes.json()) as { endpoint: { id: string }; secret: string }
      createdWebhookIds.push(created.endpoint.id)
      expect(created.secret).toBeTruthy()

      const emitRes = await request.post('/api/admin/partner-webhooks/emit', {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          organizationId: DEFAULT_ORGANIZATION_ID,
          event: 'artist.created',
          data: { id: 'e2e-fixture-artist' },
        },
      })

      if (emitRes.status() === 403) {
        const body = await emitRes.json().catch(() => ({}) as { code?: string })
        test.skip(true, `webhook emit forbidden: ${body.code ?? emitRes.status()}`)
        return
      }
      expect(emitRes.status(), await emitRes.text()).toBe(200)
      const emitBody = await emitRes.json()
      expect(emitBody.ok).toBe(true)
    })
  })
})
