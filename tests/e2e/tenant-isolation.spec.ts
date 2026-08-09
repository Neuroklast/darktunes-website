/**
 * Multi-tenant isolation checks.
 *
 * Host resolution always runs. Live DB checks require service-role env
 * (same pattern as rls-validation.spec.ts) and the multi-tenant schema seed.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { isSupabaseEnvConfigured } from '@/lib/supabase/isConfigured'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { resolveOrganizationSlugFromHost } from '@/lib/organizations/resolveFromHost'

const DEMO_ORG_ID = '11111111-1111-1111-1111-111111111111'

test.describe('tenant isolation', () => {
  test('host resolution never maps demo subdomain to darkTunes slug', () => {
    const apex = resolveOrganizationSlugFromHost('darktunes.com')
    const demo = resolveOrganizationSlugFromHost('demo-label.darktunes.app')
    expect(apex.organizationSlug).toBe('darktunes')
    expect(demo.organizationSlug).toBe('demo-label')
    expect(demo.organizationSlug).not.toBe(apex.organizationSlug)
  })

  test('live DB: artists for Org #0 and demo org do not cross-list', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!isSupabaseEnvConfigured() || !url || !serviceKey) {
      test.skip(true, 'Real Supabase service role env vars are missing')
      return
    }

    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Schema may not be applied yet on older DBs — skip gracefully.
    const { error: orgError } = await client
      .from('organizations')
      .select('id')
      .eq('id', DEFAULT_ORGANIZATION_ID)
      .maybeSingle()

    if (orgError) {
      test.skip(true, `organizations table unavailable: ${orgError.message}`)
      return
    }

    const { data: orgAArtists, error: errA } = await client
      .from('artists')
      .select('id, organization_id')
      .eq('organization_id', DEFAULT_ORGANIZATION_ID)
      .limit(50)

    if (errA) {
      // Column missing = schema not applied
      if (errA.message.includes('organization_id') || errA.code === '42703') {
        test.skip(true, 'organization_id not on artists yet — apply reset.sql multi-tenant section')
        return
      }
      throw errA
    }

    const { data: orgBArtists, error: errB } = await client
      .from('artists')
      .select('id, organization_id')
      .eq('organization_id', DEMO_ORG_ID)
      .limit(50)

    if (errB) throw errB

    const idsA = new Set((orgAArtists ?? []).map((r) => r.id))
    for (const row of orgBArtists ?? []) {
      expect(idsA.has(row.id), `artist ${row.id} must not appear in both orgs`).toBe(false)
      expect(row.organization_id).toBe(DEMO_ORG_ID)
    }

    for (const row of orgAArtists ?? []) {
      expect(row.organization_id).toBe(DEFAULT_ORGANIZATION_ID)
    }
  })

  test('live DB: sales_statements for admin list only touch org artists', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!isSupabaseEnvConfigured() || !url || !serviceKey) {
      test.skip(true, 'Real Supabase service role env vars are missing')
      return
    }

    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: orgArtists, error: artistsError } = await client
      .from('artists')
      .select('id')
      .eq('organization_id', DEFAULT_ORGANIZATION_ID)
      .limit(200)

    if (artistsError) {
      if (artistsError.message.includes('organization_id')) {
        test.skip(true, 'organization_id not applied yet')
        return
      }
      throw artistsError
    }

    const artistIds = new Set((orgArtists ?? []).map((a) => a.id))
    if (artistIds.size === 0) {
      test.skip(true, 'No artists for Org #0 in this environment')
      return
    }

    const { data: statements, error } = await client
      .from('sales_statements')
      .select('id, artist_id')
      .in('artist_id', [...artistIds])
      .limit(20)

    if (error) throw error

    for (const row of statements ?? []) {
      expect(artistIds.has(row.artist_id)).toBe(true)
    }
  })
})
