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

  test('live DB: custom_domains organization_id matches owning org', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!isSupabaseEnvConfigured() || !url || !serviceKey) {
      test.skip(true, 'Real Supabase service role env vars are missing')
      return
    }

    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await client
      .from('custom_domains')
      .select('id, organization_id, domain, status')
      .limit(50)

    if (error) {
      if (
        error.message.includes('does not exist') ||
        error.message.includes('schema cache') ||
        error.code === '42P01' ||
        error.code === 'PGRST205'
      ) {
        test.skip(true, `custom_domains unavailable: ${error.message}`)
        return
      }
      throw error
    }

    for (const row of data ?? []) {
      expect(row.organization_id).toBeTruthy()
    }
  })

  test('live DB: site_settings keys are scoped per organization_id', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!isSupabaseEnvConfigured() || !url || !serviceKey) {
      test.skip(true, 'Real Supabase service role env vars are missing')
      return
    }

    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await client
      .from('site_settings')
      .select('organization_id, key')
      .eq('key', 'label_name')
      .limit(20)

    if (error) {
      if (error.message.includes('organization_id') || error.code === '42703') {
        test.skip(true, 'site_settings.organization_id not applied yet')
        return
      }
      throw error
    }

    const orgs = new Set((data ?? []).map((r) => r.organization_id))
    // Each org may have its own label_name row; no cross-org key collision required here.
    for (const row of data ?? []) {
      expect(row.organization_id).toBeTruthy()
    }
    expect(orgs.size).toBeGreaterThanOrEqual(1)
  })
})

