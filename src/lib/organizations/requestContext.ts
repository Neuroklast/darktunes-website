import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getOrganizationBySlug } from '@/lib/api/organizations'
import { getOrganizationIdByCustomDomain } from '@/lib/api/customDomains'
import {
  DEFAULT_ORGANIZATION_ID,
  HEADER_ORGANIZATION_ID,
  HEADER_ORGANIZATION_SLUG,
  HEADER_SURFACE,
} from '@/lib/organizations/constants'
import {
  resolveOrganizationSlugFromHost,
  type AppSurface,
} from '@/lib/organizations/resolveFromHost'
import { ApiError } from '@/lib/errors'

type DbClient = SupabaseClient<Database>

export interface RequestOrganizationContext {
  organizationId: string
  organizationSlug: string
  surface: AppSurface
}

/**
 * Resolves the active organization for the current request.
 * Priority: proxy headers → custom domain → host subdomain → Org #0.
 */
export async function getRequestOrganizationId(db?: DbClient): Promise<string> {
  const ctx = await getRequestOrganizationContext(db)
  return ctx.organizationId
}

export async function getRequestOrganizationContext(
  db?: DbClient,
): Promise<RequestOrganizationContext> {
  const h = await headers()
  const headerOrgId = h.get(HEADER_ORGANIZATION_ID)
  const headerSlug = h.get(HEADER_ORGANIZATION_SLUG)
  const headerSurface = h.get(HEADER_SURFACE) as AppSurface | null

  if (headerOrgId) {
    return {
      organizationId: headerOrgId,
      organizationSlug: headerSlug ?? 'darktunes',
      surface: headerSurface ?? 'tenant',
    }
  }

  const host = h.get('host')?.split(':')[0] ?? null
  const resolved = resolveOrganizationSlugFromHost(host)

  if (db && host) {
    const fromCustomDomain = await getOrganizationIdByCustomDomain(db, host)
    if (fromCustomDomain) {
      return {
        organizationId: fromCustomDomain,
        organizationSlug: resolved.organizationSlug,
        surface: 'tenant',
      }
    }
  }

  if (!db || resolved.organizationSlug === 'darktunes') {
    return {
      organizationId: DEFAULT_ORGANIZATION_ID,
      organizationSlug: resolved.organizationSlug,
      surface: resolved.surface,
    }
  }

  const org = await getOrganizationBySlug(db, resolved.organizationSlug)
  return {
    organizationId: org?.id ?? DEFAULT_ORGANIZATION_ID,
    organizationSlug: resolved.organizationSlug,
    surface: resolved.surface,
  }
}

/** Throws if no organization context (should not happen after proxy wiring). */
export async function requireOrganizationId(db?: DbClient): Promise<string> {
  const id = await getRequestOrganizationId(db)
  if (!id) throw new ApiError(400, 'Organization context missing')
  return id
}
