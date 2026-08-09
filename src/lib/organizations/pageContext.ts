import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getOrganizationBranding } from '@/lib/api/organizationBranding'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'

export interface PublicPageOrganizationContext {
  organizationId: string
  branding: Awaited<ReturnType<typeof getOrganizationBranding>>
}

/** Resolves tenant + branding for public RSC pages (host/subdomain/custom domain). */
export async function getPublicPageOrganizationContext(): Promise<PublicPageOrganizationContext> {
  const db = createPublicSupabaseClient()
  const organizationId = await getRequestOrganizationId(db)
  const branding = await getOrganizationBranding(db, organizationId).catch(() => null)
  return { organizationId, branding }
}
