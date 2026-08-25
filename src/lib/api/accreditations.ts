import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { AccreditationRequest } from '@/types'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type AccreditationRow = Database['public']['Tables']['accreditation_requests']['Row']
type AccreditationInsert = Database['public']['Tables']['accreditation_requests']['Insert']

function rowToAccreditation(row: AccreditationRow): AccreditationRequest {
  return {
    id: row.id,
    journalistId: row.journalist_id,
    eventName: row.event_name,
    eventDate: row.event_date,
    publication: row.publication,
    reason: row.reason,
    status: row.status,
    adminNote: row.admin_note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createRequest(
  db: DbClient,
  data: AccreditationInsert,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<AccreditationRequest> {
  const payload: AccreditationInsert = {
    ...data,
    organization_id: data.organization_id ?? organizationId,
  }
  const { data: row, error } = await db
    .from('accreditation_requests')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('No data returned from createRequest')
  return rowToAccreditation(row)
}

export async function listRequests(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<AccreditationRequest[]> {
  const { data, error } = await db
    .from('accreditation_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAccreditation)
}

export async function updateStatus(
  db: DbClient,
  id: string,
  status: 'approved' | 'rejected',
  adminNote: string | null,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<AccreditationRequest> {
  const { data, error } = await db
    .from('accreditation_requests')
    .update({ status, admin_note: adminNote })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateStatus')
  return rowToAccreditation(data)
}
