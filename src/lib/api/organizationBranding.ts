import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['organization_branding']['Row']

export interface OrganizationBranding {
  organizationId: string
  logoUrl: string | null
  faviconUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  fontFamily: string | null
}

function rowToBranding(row: Row): OrganizationBranding {
  return {
    organizationId: row.organization_id,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    fontFamily: row.font_family,
  }
}

export async function getOrganizationBranding(
  db: DbClient,
  organizationId: string,
): Promise<OrganizationBranding | null> {
  const { data, error } = await db
    .from('organization_branding')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToBranding(data) : null
}
