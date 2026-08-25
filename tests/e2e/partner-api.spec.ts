/**
 * Partner API (app/api/v1/**) — HTTP-level checks.
 *
 * Auth is a raw `Authorization: Bearer dt_live_...` key, sha256-hashed into
 * organization_api_keys.key_hash (see src/lib/partner-api/auth.ts). There is
 * no seeded key for this in the base fixture data, so this file seeds its
 * own via a service-role client in beforeAll and cleans up in afterAll —
 * same pattern as tests/e2e/tenant-isolation.spec.ts.
 *
 * Every DB-backed test skips gracefully (via `schemaReady`) when service-role
 * env is absent or the multi-tenant schema (organizations,
 * organization_api_keys, organization_features, ...) hasn't been applied to
 * the target DB yet. The two pure auth-format checks below don't touch the
 * DB at all (authenticatePartnerApiKey short-circuits on a missing/malformed
 * key before any query), so they run unconditionally.
 *
 * Scope note: every v1 route (`artists`, `releases`, `release-submissions`,
 * `analytics/export`) currently calls `requirePartnerScope(auth, 'read')` —
 * there is no endpoint requiring a *different* scope today. So the
 * scope-forbidden sub-case below seeds a key that deliberately lacks 'read'
 * (scopes: ['write']) rather than pointing two differently-scoped endpoints
 * at each other.
 */
import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseEnvConfigured } from '@/lib/supabase/isConfigured'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { hashPartnerApiKey, PARTNER_API_KEY_PREFIX } from '@/lib/partner-api/hash'
import { createServiceRoleTestClient } from '../helpers/supabase'
import type { Database } from '@/types/database'

const DEMO_ORG_ID = '11111111-1111-1111-1111-111111111111'

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

function makeRawKey(): string {
  return `${PARTNER_API_KEY_PREFIX}${randomSuffix()}${randomSuffix()}${randomSuffix()}`
}

// ---------------------------------------------------------------------------
// Auth-format checks — no DB dependency, always run.
// ---------------------------------------------------------------------------

test.describe('partner API auth format (no DB required)', () => {
  test('401 PARTNER_API_KEY_INVALID with no Authorization header', async ({ request }) => {
    const res = await request.get('/api/v1/artists')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('PARTNER_API_KEY_INVALID')
  })

  test('401 PARTNER_API_KEY_INVALID with a malformed key (missing dt_live_ prefix)', async ({
    request,
  }) => {
    const res = await request.get('/api/v1/artists', {
      headers: { Authorization: 'Bearer sk_totally-wrong-prefix-123' },
    })
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('PARTNER_API_KEY_INVALID')
  })
})

// ---------------------------------------------------------------------------
// Scope + cross-org + feature-gate checks — require the multi-tenant schema.
// ---------------------------------------------------------------------------

test.describe('partner API scopes, isolation, and feature gate (DB required)', () => {
  let client: SupabaseClient<Database> | null = null
  let schemaReady = false

  const seededKeyIds: string[] = []
  const seededOrgIds: string[] = []

  let orgAReadKey = '' // Org #0, scopes ['read']
  let orgBReadKey = '' // Demo Label, scopes ['read']
  let noReadScopeKey = '' // Org #0, scopes ['write'] only
  let disabledOrgKey = '' // throwaway org with no partner_api feature

  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!isSupabaseEnvConfigured() || !url || !serviceKey) return

    client = createServiceRoleTestClient(url, serviceKey)

    // Schema may not be applied yet on this DB — same probe pattern as
    // tenant-isolation.spec.ts. Bail out (leaving schemaReady false) rather
    // than throwing, so every test below skips cleanly instead of erroring.
    const keysProbe = await client.from('organization_api_keys').select('id').limit(1)
    if (keysProbe.error) return

    const orgsProbe = await client
      .from('organizations')
      .select('id')
      .in('id', [DEFAULT_ORGANIZATION_ID, DEMO_ORG_ID])
    if (orgsProbe.error || (orgsProbe.data ?? []).length < 2) return

    schemaReady = true

    async function insertKey(organizationId: string, scopes: string[], name: string): Promise<string> {
      const rawKey = makeRawKey()
      const { data, error } = await client!
        .from('organization_api_keys')
        .insert({
          organization_id: organizationId,
          name,
          key_prefix: rawKey.slice(0, 16),
          key_hash: hashPartnerApiKey(rawKey),
          scopes,
        })
        .select('id')
        .single()
      if (error) throw error
      seededKeyIds.push(data.id)
      return rawKey
    }

    orgAReadKey = await insertKey(DEFAULT_ORGANIZATION_ID, ['read'], 'e2e-org-a-read')
    orgBReadKey = await insertKey(DEMO_ORG_ID, ['read'], 'e2e-org-b-read')
    noReadScopeKey = await insertKey(DEFAULT_ORGANIZATION_ID, ['write'], 'e2e-org-a-write-only')

    // Throwaway org with no organization_features override and no
    // subscription: organizationHasFeature() falls back to the 'starter'
    // plan defaults, which do not include partner_api — so this org is
    // disabled for the Partner API without any extra setup.
    const { data: org, error: orgError } = await client
      .from('organizations')
      .insert({
        name: 'E2E Partner Disabled Org',
        slug: `e2e-partner-disabled-${randomSuffix()}`,
        status: 'active',
      })
      .select('id')
      .single()

    if (!orgError && org) {
      seededOrgIds.push(org.id)
      disabledOrgKey = await insertKey(org.id, ['read'], 'e2e-disabled-org-key')
    }
  })

  test.afterAll(async () => {
    if (!client) return
    if (seededKeyIds.length) {
      await client.from('organization_api_keys').delete().in('id', seededKeyIds)
    }
    if (seededOrgIds.length) {
      await client.from('organizations').delete().in('id', seededOrgIds)
    }
  })

  test.beforeEach(() => {
    test.skip(
      !schemaReady,
      'Multi-tenant schema (organizations / organization_api_keys) not applied, or Supabase service-role env missing',
    )
  })

  test('200 + org-scoped payload with a valid read-scoped key', async ({ request }) => {
    const res = await request.get('/api/v1/artists', {
      headers: { Authorization: `Bearer ${orgAReadKey}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)

    // Cross-check every returned id truly belongs to Org #0.
    const { data: orgArtists, error } = await client!
      .from('artists')
      .select('id')
      .eq('organization_id', DEFAULT_ORGANIZATION_ID)
    if (error) throw error
    const orgIds = new Set((orgArtists ?? []).map((a) => a.id))
    for (const row of body.data as Array<{ id: string }>) {
      expect(orgIds.has(row.id), `artist ${row.id} not in Org #0`).toBe(true)
    }
  })

  test('GET /api/v1/releases and /api/v1/release-submissions return 200 for a read-scoped key', async ({
    request,
  }) => {
    for (const path of ['/api/v1/releases', '/api/v1/release-submissions']) {
      const res = await request.get(path, {
        headers: { Authorization: `Bearer ${orgAReadKey}` },
      })
      expect(res.status(), `${path} should be 200 for an enabled, read-scoped org`).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.data)).toBe(true)
    }
  })

  test('GET /api/v1/analytics/export enforces the read scope before its own param validation', async ({
    request,
  }) => {
    // No artistId supplied: a read-scoped key should get past auth + scope +
    // feature checks and only then hit the route's own 400 "artistId is
    // required" — proof the earlier gates passed for the right reason.
    const ok = await request.get('/api/v1/analytics/export', {
      headers: { Authorization: `Bearer ${orgAReadKey}` },
    })
    expect(ok.status()).toBe(400)

    const forbidden = await request.get('/api/v1/analytics/export', {
      headers: { Authorization: `Bearer ${noReadScopeKey}` },
    })
    expect(forbidden.status()).toBe(403)
    const body = await forbidden.json()
    expect(body.code).toBe('PARTNER_SCOPE_FORBIDDEN')
  })

  test('403 PARTNER_SCOPE_FORBIDDEN when the key lacks the read scope', async ({ request }) => {
    const res = await request.get('/api/v1/artists', {
      headers: { Authorization: `Bearer ${noReadScopeKey}` },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('PARTNER_SCOPE_FORBIDDEN')
  })

  test('cross-org isolation: each key only sees its own org via /api/v1/artists', async ({
    request,
  }) => {
    const [resA, resB] = await Promise.all([
      request.get('/api/v1/artists', { headers: { Authorization: `Bearer ${orgAReadKey}` } }),
      request.get('/api/v1/artists', { headers: { Authorization: `Bearer ${orgBReadKey}` } }),
    ])
    expect(resA.status()).toBe(200)
    expect(resB.status()).toBe(200)

    const bodyA = await resA.json()
    const bodyB = await resB.json()
    const idsA = new Set((bodyA.data as Array<{ id: string }>).map((a) => a.id))
    const idsB = new Set((bodyB.data as Array<{ id: string }>).map((a) => a.id))

    for (const id of idsB) {
      expect(idsA.has(id), `artist ${id} leaked into both org A and org B responses`).toBe(false)
    }

    // Cross-check against direct DB truth per org — same logic as
    // tenant-isolation.spec.ts's "artists for Org #0 and demo org do not
    // cross-list" test.
    const { data: dbArtistsA } = await client!
      .from('artists')
      .select('id')
      .eq('organization_id', DEFAULT_ORGANIZATION_ID)
    const { data: dbArtistsB } = await client!
      .from('artists')
      .select('id')
      .eq('organization_id', DEMO_ORG_ID)
    const dbIdsA = new Set((dbArtistsA ?? []).map((a) => a.id))
    const dbIdsB = new Set((dbArtistsB ?? []).map((a) => a.id))

    for (const id of idsA) expect(dbIdsA.has(id)).toBe(true)
    for (const id of idsB) expect(dbIdsB.has(id)).toBe(true)
  })

  test('403 PARTNER_API_DISABLED when partner_api is off for the org', async ({ request }) => {
    test.skip(
      !disabledOrgKey,
      'Could not seed a throwaway org without partner_api during beforeAll',
    )

    const res = await request.get('/api/v1/artists', {
      headers: { Authorization: `Bearer ${disabledOrgKey}` },
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('PARTNER_API_DISABLED')
  })
})
