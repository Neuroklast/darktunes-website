import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

type DbClient = SupabaseClient<Database>

export interface AuditLogEntry {
  id: string
  organizationId: string
  userId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export async function writeOrganizationAuditLog(
  db: DbClient,
  input: {
    organizationId: string
    userId?: string | null
    action: string
    targetType?: string
    targetId?: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await db.from('organization_audit_log').insert({
    organization_id: input.organizationId,
    user_id: input.userId ?? null,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: (input.metadata ?? null) as Json | null,
  })
  if (error) throw new Error(error.message)
}

export async function listOrganizationAuditLogs(
  db: DbClient,
  organizationId: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  const { data, error } = await db
    .from('organization_audit_log')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.created_at,
  }))
}
