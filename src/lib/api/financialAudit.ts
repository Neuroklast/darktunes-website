import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

export interface FinancialAuditInput {
  entityType: string
  entityId: string
  action: string
  actorId?: string | null
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  /** Host organization; defaults to Org #0 */
  organizationId?: string
}

export async function logFinancialEvent(db: DbClient, input: FinancialAuditInput): Promise<void> {
  const { error } = await db.from('financial_audit_events').insert({
    organization_id: input.organizationId ?? DEFAULT_ORGANIZATION_ID,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    actor_id: input.actorId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
  })

  if (error) throw new Error(error.message)
}

export async function listFinancialAuditEvents(
  db: DbClient,
  entityType: string,
  entityId: string,
  limit = 50,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Database['public']['Tables']['financial_audit_events']['Row'][]> {
  const { data, error } = await db
    .from('financial_audit_events')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return data ?? []
}

export interface FinancialAuditEvent {
  id: string
  entityType: string
  entityId: string
  action: string
  actorId: string | null
  beforeData: Record<string, unknown> | null
  afterData: Record<string, unknown> | null
  createdAt: string
  organizationId: string
}

function rowToEvent(
  row: Database['public']['Tables']['financial_audit_events']['Row'],
): FinancialAuditEvent {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorId: row.actor_id,
    beforeData: row.before_data as Record<string, unknown> | null,
    afterData: row.after_data as Record<string, unknown> | null,
    createdAt: row.created_at,
    organizationId: row.organization_id,
  }
}

export async function listRecentFinancialAuditEvents(
  db: DbClient,
  limit = 100,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<FinancialAuditEvent[]> {
  const { data, error } = await db
    .from('financial_audit_events')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToEvent)
}
