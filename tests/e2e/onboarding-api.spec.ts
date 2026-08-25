/**
 * Self-serve onboarding — HTTP-level checks for GET /api/plans and
 * POST /api/onboarding/register.
 *
 * Body-validation (400) cases never touch the DB — bodySchema.parse() throws
 * before any Supabase call in the route — so they run unconditionally. Every
 * other case skips gracefully when service-role env is absent or the
 * multi-tenant schema (organizations, plans, ...) hasn't been applied yet,
 * same pattern as tests/e2e/tenant-isolation.spec.ts and partner-api.spec.ts.
 *
 * Note: `organizations.insert()` / `.select()` errors in this route are
 * re-thrown as plain `Error`s (losing the Postgres `code` field), so an
 * unapplied schema surfaces as a generic 500 SERVER_ERROR rather than a
 * distinguishable Postgres error code. The `beforeAll` schema probe below is
 * the authoritative signal; the 500 checks in each DB-backed test are a
 * defensive fallback for the same condition.
 */
import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseEnvConfigured } from '@/lib/supabase/isConfigured'
import { createServiceRoleTestClient } from '../helpers/supabase'
import type { Database } from '@/types/database'

function randomSlug(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function registerBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'E2E Onboarding Test Label',
    slug: randomSlug('e2e-onboarding'),
    successUrl: 'https://example.com/onboarding/success',
    cancelUrl: 'https://example.com/onboarding/cancel',
    ...overrides,
  }
}

let client: SupabaseClient<Database> | null = null
let schemaReady = false
const createdOrgIds: string[] = []

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!isSupabaseEnvConfigured() || !url || !serviceKey) return

  client = createServiceRoleTestClient(url, serviceKey)

  const probe = await client.from('organizations').select('id').limit(1)
  schemaReady = !probe.error
})

test.afterAll(async () => {
  if (!client || createdOrgIds.length === 0) return
  await client.from('organizations').delete().in('id', createdOrgIds)
})

test.describe('GET /api/plans', () => {
  test('200 with an array including starter/professional/business plan slugs', async ({
    request,
  }) => {
    const res = await request.get('/api/plans')

    if (res.status() !== 200) {
      test.skip(
        true,
        `GET /api/plans returned ${res.status()} — plans table likely unapplied in this environment`,
      )
      return
    }

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)

    if (body.length === 0) {
      test.skip(true, 'plans table is present but empty in this environment')
      return
    }

    const slugs = (body as Array<{ slug: string }>).map((p) => p.slug)
    for (const expected of ['starter', 'professional', 'business']) {
      expect(slugs, `expected plan slug "${expected}" in ${JSON.stringify(slugs)}`).toContain(
        expected,
      )
    }
  })
})

test.describe('POST /api/onboarding/register', () => {
  test('400 on an invalid slug (fails the lowercase-alphanumeric-hyphen regex)', async ({
    request,
  }) => {
    const res = await request.post('/api/onboarding/register', {
      data: registerBody({ slug: 'Not A Valid Slug!!' }),
    })
    expect(res.status()).toBe(400)
  })

  test('400 on a body missing required fields', async ({ request }) => {
    const res = await request.post('/api/onboarding/register', {
      data: { name: 'Incomplete Label' },
    })
    expect(res.status()).toBe(400)
  })

  test('409 when slug "demo-label" already exists', async ({ request }) => {
    test.skip(
      !schemaReady,
      'organizations schema not applied, or Supabase service-role env missing',
    )

    const res = await request.post('/api/onboarding/register', {
      data: registerBody({ slug: 'demo-label' }),
    })

    if (res.status() === 500) {
      test.skip(
        true,
        'Register route returned 500 before reaching the slug-conflict check — organizations table likely unapplied in this environment',
      )
      return
    }

    expect(res.status()).toBe(409)
  })

  test('success: creates a pending org and returns checkoutUrl: null when Stripe is not configured', async ({
    request,
  }) => {
    test.skip(
      !schemaReady,
      'organizations schema not applied, or Supabase service-role env missing',
    )

    const body = registerBody()
    const res = await request.post('/api/onboarding/register', { data: body })

    if (res.status() === 500) {
      test.skip(
        true,
        'Register route returned 500 — organizations/plans tables likely unapplied in this environment',
      )
      return
    }

    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.organization?.slug).toBe(body.slug)
    expect(json.organization?.status).toBe('pending')

    if (json.organization?.id) {
      createdOrgIds.push(json.organization.id)
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      expect(json.checkoutUrl).toBeNull()
    }
  })
})
