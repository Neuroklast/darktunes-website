/**
 * src/lib/api/journalistApplications.ts
 *
 * Data Access Layer for the `journalist_applications` table.
 * Applications are scoped per organization (host label).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type ApplicationRow = Database['public']['Tables']['journalist_applications']['Row']
type ApplicationInsert = Database['public']['Tables']['journalist_applications']['Insert']

export interface JournalistApplication {
  id: string
  userId: string | undefined
  email: string
  name: string
  outlet: string
  message: string | undefined
  websiteUrl: string | undefined
  reason: string | undefined
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy: string | undefined
  reviewedAt: string | undefined
  createdAt: string
  organizationId: string
}

function rowToApplication(row: ApplicationRow): JournalistApplication {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    email: row.email,
    name: row.name,
    outlet: row.outlet,
    message: row.message ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    reason: row.reason ?? undefined,
    status: row.status,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    createdAt: row.created_at,
    organizationId: row.organization_id,
  }
}

/** Fetches applications for one organization, newest first. */
export async function getJournalistApplications(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<JournalistApplication[]> {
  const { data, error } = await db
    .from('journalist_applications')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToApplication(row as ApplicationRow))
}

/**
 * Fetches the most recent application for a user on one organization.
 * Returns null if no application exists (PGRST116).
 */
export async function getJournalistApplicationByUserId(
  db: DbClient,
  userId: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<JournalistApplication | null> {
  const { data, error } = await db
    .from('journalist_applications')
    .select('*')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return data ? rowToApplication(data as ApplicationRow) : null
}

/** Inserts a new journalist application for the host organization. */
export async function createJournalistApplication(
  db: DbClient,
  application: ApplicationInsert,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<JournalistApplication> {
  const payload: ApplicationInsert = {
    ...application,
    organization_id: application.organization_id ?? organizationId,
  }
  const { data, error } = await db
    .from('journalist_applications')
    .insert(payload)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createJournalistApplication')
  return rowToApplication(data as ApplicationRow)
}

/**
 * Updates an application's status to 'approved' or 'rejected' within an organization.
 */
export async function updateApplicationStatus(
  db: DbClient,
  id: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<JournalistApplication> {
  const { data, error } = await db
    .from('journalist_applications')
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateApplicationStatus')
  return rowToApplication(data as ApplicationRow)
}
