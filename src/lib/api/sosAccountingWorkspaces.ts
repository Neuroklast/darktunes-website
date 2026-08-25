/**
 * DAL for sos_accounting_workspaces — server-persisted live accounting workspace
 * for a Sales Statement period. Stores rules config + attached bronze batch references.
 * Scoped by organization_id (table name keeps legacy sos_* path).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  normalizeAccountingConfig,
  type SosAccountingSettings,
} from '@/lib/sos/sosAccountingSettings'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { toDbRecord } from '@/lib/types/jsonColumns'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['sos_accounting_workspaces']['Row']

export type AccountingWorkspaceConfig = SosAccountingSettings

export interface SosAccountingWorkspace {
  id: string
  periodStart: string
  periodEnd: string
  config: AccountingWorkspaceConfig
  bronzeBatchIds: string[]
  updatedBy: string | undefined
  createdAt: string
  updatedAt: string
}

export interface UpsertAccountingWorkspaceInput {
  periodStart: string
  periodEnd: string
  config: AccountingWorkspaceConfig
  bronzeBatchIds?: string[]
  updatedBy?: string | null
  organizationId?: string
}

function rowToWorkspace(row: Row): SosAccountingWorkspace {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    config: normalizeAccountingConfig(row.config as Partial<SosAccountingSettings>),
    bronzeBatchIds: row.bronze_batch_ids ?? [],
    updatedBy: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getWorkspaceForPeriod(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosAccountingWorkspace | null> {
  const { data, error } = await db
    .from('sos_accounting_workspaces')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? rowToWorkspace(data as Row) : null
}

export async function upsertWorkspaceForPeriod(
  db: DbClient,
  input: UpsertAccountingWorkspaceInput,
): Promise<SosAccountingWorkspace> {
  const organizationId = input.organizationId ?? DEFAULT_ORGANIZATION_ID
  const config = normalizeAccountingConfig(input.config)
  const { data, error } = await db
    .from('sos_accounting_workspaces')
    .upsert(
      {
        organization_id: organizationId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        config: toDbRecord(config),
        bronze_batch_ids: input.bronzeBatchIds ?? [],
        updated_by: input.updatedBy ?? null,
      },
      { onConflict: 'organization_id,period_start,period_end' },
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToWorkspace(data as Row)
}

export async function listAccountingWorkspaces(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosAccountingWorkspace[]> {
  const { data, error } = await db
    .from('sos_accounting_workspaces')
    .select('*')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToWorkspace(row as Row))
}

export async function deleteWorkspaceForPeriod(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<boolean> {
  const { data, error } = await db
    .from('sos_accounting_workspaces')
    .delete()
    .eq('organization_id', organizationId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .select('id')

  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}
