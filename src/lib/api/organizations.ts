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
  return rowToOrganization(data)
}

export async function listOrganizations(db: DbClient): Promise<Organization[]> {
  const { data, error } = await db
    .from('organizations')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToOrganization)
}
