/**
 * Edge/proxy-safe organization lookup by slug or custom domain.
 * Uses anon key (public org rows) — no cookies.
 */

import { createClient } from '@supabase/supabase-js'
import {
  DEFAULT_ORGANIZATION_ID,
  DEFAULT_ORGANIZATION_SLUG,
} from '@/lib/organizations/constants'
import type { Database } from '@/types/database'

export type OrganizationStatus = Database['public']['Enums']['organization_status']

export interface LookupOrganizationResult {
  id: string
  slug: string
  status: OrganizationStatus
  found: boolean
}

function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Resolve organization for a host + pre-parsed slug.
 * Returns Org #0 for darktunes slug without a round-trip when possible.
 */
export async function lookupOrganizationForRequest(
  host: string | null,
  organizationSlug: string,
): Promise<LookupOrganizationResult> {
  if (organizationSlug === DEFAULT_ORGANIZATION_SLUG) {
    return {
      id: DEFAULT_ORGANIZATION_ID,
      slug: DEFAULT_ORGANIZATION_SLUG,
      status: 'active',
      found: true,
    }
  }

  const client = createAnonClient()
  if (!client) {
    return {
      id: DEFAULT_ORGANIZATION_ID,
      slug: DEFAULT_ORGANIZATION_SLUG,
      status: 'active',
      found: false,
    }
  }

  const normalizedHost = (host ?? '').split(':')[0]?.toLowerCase() ?? ''

  if (normalizedHost) {
    try {
      const { data: domainRow } = await client
        .from('custom_domains')
        .select('organization_id, status')
        .eq('domain', normalizedHost.replace(/^www\./, ''))
        .in('status', ['verified', 'active'])
        .maybeSingle()

      if (domainRow?.organization_id) {
        const { data: org } = await client
          .from('organizations')
          .select('id, slug, status')
          .eq('id', domainRow.organization_id)
          .maybeSingle()
        if (org) {
          return {
            id: org.id,
            slug: org.slug,
            status: org.status,
            found: true,
          }
        }
      }
    } catch {
      // table may not exist yet
    }
  }

  try {
    const { data: org } = await client
      .from('organizations')
      .select('id, slug, status')
      .eq('slug', organizationSlug)
      .maybeSingle()

    if (org) {
      return {
        id: org.id,
        slug: org.slug,
        status: org.status,
        found: true,
      }
    }
  } catch {
    // schema not applied
  }

  return {
    id: DEFAULT_ORGANIZATION_ID,
    slug: organizationSlug,
    status: 'active',
    found: false,
  }
}

/** Paths allowed when org is suspended / past_due / canceled (billing + account). */
export function isSuspendedOrgAllowedPath(pathname: string): boolean {
  if (pathname.startsWith('/api/stripe')) return true
  if (pathname.startsWith('/onboarding')) return true
  if (pathname.startsWith('/pricing')) return true
  if (pathname.startsWith('/login')) return true
  if (pathname.startsWith('/auth')) return true
  if (pathname.startsWith('/account')) return true
  return false
}
