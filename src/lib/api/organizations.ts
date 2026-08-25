import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

export type OrganizationStatus = Database['public']['Enums']['organization_status']
export type OrganizationUserRole = Database['public']['Enums']['organization_user_role']

export interface Organization {
  id: string
  name: string
  slug: string
  status: OrganizationStatus
  createdAt: string
  updatedAt: string
}

type OrganizationRow = Database['public']['Tables']['organizations']['Row']

function rowToOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getOrganizationById(
  db: DbClient,
  id: string,
): Promise<Organization | null> {
  const { data, error } = await db
    .from('organizations')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToOrganization(data) : null
}

export async function getOrganizationBySlug(
  db: DbClient,
  slug: string,
): Promise<Organization | null> {
  const { data, error } = await db
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToOrganization(data) : null
}

export async function getDefaultOrganization(db: DbClient): Promise<Organization | null> {
  return getOrganizationById(db, DEFAULT_ORGANIZATION_ID)
}

export async function createOrganization(
  db: DbClient,
  input: { name: string; slug: string; status?: OrganizationStatus },
): Promise<Organization> {
  const { data, error } = await db
    .from('organizations')
    .insert({
      name: input.name,
      slug: input.slug,
      status: input.status ?? 'pending',
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createOrganization')
  const org = rowToOrganization(data)
  // Best-effort: seed portal feature flags for the new label
  try {
    const { ensurePortalFeatureFlagsForOrganization } = await import('@/lib/api/featureFlags')
    await ensurePortalFeatureFlagsForOrganization(db, org.id)
  } catch {
    // Non-fatal — flags can be provisioned later
  }
  return org
}

/** Unfiltered list — prefer listOrganizationsAccessibleToUser for admin UIs. */
export async function listOrganizations(db: DbClient): Promise<Organization[]> {
  const { data, error } = await db
    .from('organizations')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToOrganization)
}

export async function isUserPlatformAdmin(db: DbClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await db
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      // Table missing during expand → treat as non-platform
      const msg = error.message.toLowerCase()
      if (
        msg.includes('does not exist') ||
        msg.includes('schema cache') ||
        error.code === '42P01' ||
        error.code === 'PGRST205'
      ) {
        return false
      }
      return false
    }
    return Boolean(data)
  } catch {
    return false
  }
}

/**
 * Organizations the staff user may administer in the ops console.
 * - platform_admins: all rows
 * - otherwise: organization_users memberships + Org #0 (legacy single-tenant admin)
 */
export async function listOrganizationsAccessibleToUser(
  db: DbClient,
  userId: string,
): Promise<Organization[]> {
  if (await isUserPlatformAdmin(db, userId)) {
    return listOrganizations(db)
  }

  const allowedIds = new Set<string>([DEFAULT_ORGANIZATION_ID])

  try {
    const { data: memberships, error } = await db
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
    if (!error && memberships) {
      for (const row of memberships) {
        allowedIds.add(row.organization_id)
      }
    }
  } catch {
    // membership table missing → Org #0 only
  }

  const { data, error } = await db
    .from('organizations')
    .select('*')
    .in('id', [...allowedIds])
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToOrganization)
}
