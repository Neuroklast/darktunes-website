/**
 * Active organizations for multi-tenant cron / sync fan-out.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export interface ActiveOrganization {
  id: string
  slug: string
}

/**
 * Returns active orgs. Falls back to Org #0 when the organizations table
 * is missing (schema not applied).
 */
export async function listActiveOrganizations(db: DbClient): Promise<ActiveOrganization[]> {
  try {
    const { data, error } = await db
      .from('organizations')
      .select('id, slug')
      .eq('status', 'active')
      .order('slug', { ascending: true })

    if (error) {
      return [{ id: DEFAULT_ORGANIZATION_ID, slug: 'darktunes' }]
    }

    if (!data?.length) {
      return [{ id: DEFAULT_ORGANIZATION_ID, slug: 'darktunes' }]
    }

    return data.map((row) => ({ id: row.id, slug: row.slug }))
  } catch {
    return [{ id: DEFAULT_ORGANIZATION_ID, slug: 'darktunes' }]
  }
}
