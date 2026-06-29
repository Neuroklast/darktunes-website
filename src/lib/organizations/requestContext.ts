import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { getOrganizationBySlug } from '@/lib/api/organizations'
import { getOrganizationIdByCustomDomain } from '@/lib/api/customDomains'
import { resolveOrganizationSlugFromHost } from '@/lib/organizations/resolveFromHost'

type DbClient = SupabaseClient<Database>

/**
 * Resolves the active organization for the current request.
 * Priority: x-organization-id header → host subdomain → default tenant.
 */
export async function getRequestOrganizationId(db?: DbClient): Promise<string> {
  const h = await headers()
  const headerOrgId = h.get('x-organization-id')
  if (headerOrgId) return headerOrgId

  const host = h.get('host')?.split(':')[0] ?? null

  if (db && host) {
    const fromCustomDomain = await getOrganizationIdByCustomDomain(db, host)
    if (fromCustomDomain) return fromCustomDomain
  }

  const { organizationSlug } = resolveOrganizationSlugFromHost(host)
  if (!db || organizationSlug === 'darktunes') {
    return DEFAULT_ORGANIZATION_ID
  }

  const org = await getOrganizationBySlug(db, organizationSlug)
  return org?.id ?? DEFAULT_ORGANIZATION_ID
}