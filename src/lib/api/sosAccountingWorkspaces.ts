/**
 * DAL for sos_accounting_workspaces — server-persisted live accounting workspace
 * for a period. Stores rules config + attached bronze batch references.
 * Enables collaborative, anytime retrieval of the full SOS configuration.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { BusinessRuleError } from '@/lib/errors'
import {
  normalizeAccountingConfig,
  type SosAccountingSettings,
} from '@/lib/sos/sosAccountingSettings'
import { toDbRecord } from '@/lib/types/jsonColumns'
import { compactSosLogo, hydrateSosLogo } from '@/lib/sos/logoAssets.server'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['sos_accounting_workspaces']['Row']

export type AccountingWorkspaceConfig = SosAccountingSettings

/** Optimistic-concurrency conflict — another session saved a newer revision. */
export class WorkspaceRevisionConflictError extends BusinessRuleError {
  constructor() {
    super(
      'Workspace was changed by another session — reload before saving',
      409,
      'WORKSPACE_REVISION_CONFLICT',
    )
    this.name = 'WorkspaceRevisionConflictError'
  }
}

export interface SosAccountingWorkspace {
  id: string
  periodStart: string
  periodEnd: string
  config: AccountingWorkspaceConfig
  bronzeBatchIds: string[]
  /** Monotonic revision for optimistic concurrency (starts at 1). */
  revision: number
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
  /**
   * Revision the client last read. `null` means "no workspace existed" and
   * inserts revision 1. A mismatch throws `WorkspaceRevisionConflictError`
   * instead of overwriting newer changes (last-write-wins is forbidden).
   */
  expectedRevision?: number | null
}

async function rowToWorkspace(db: DbClient, row: Row): Promise<SosAccountingWorkspace> {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    config: await hydrateSosLogo(db, normalizeAccountingConfig(row.config as Partial<SosAccountingSettings>)),
    bronzeBatchIds: row.bronze_batch_ids ?? [],
    revision: row.revision ?? 1,
    updatedBy: row.updated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getWorkspaceForPeriod(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
): Promise<SosAccountingWorkspace | null> {
  const { data, error } = await db
    .from('sos_accounting_workspaces')
    .select('*')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? rowToWorkspace(db, data as Row) : null
}

export async function upsertWorkspaceForPeriod(
  db: DbClient,
  input: UpsertAccountingWorkspaceInput,
): Promise<SosAccountingWorkspace> {
  const config = await compactSosLogo(db, normalizeAccountingConfig(input.config))
  const payload = {
    config: toDbRecord(config),
    bronze_batch_ids: input.bronzeBatchIds ?? [],
    updated_by: input.updatedBy ?? null,
  }

  if (input.expectedRevision == null) {
    // First save for this period — the client saw no workspace. A concurrent
    // insert loses on the unique (period_start, period_end) constraint.
    const { data, error } = await db
      .from('sos_accounting_workspaces')
      .insert({
        period_start: input.periodStart,
        period_end: input.periodEnd,
        ...payload,
        revision: 1,
      })
      .select()
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new WorkspaceRevisionConflictError()
      }
      throw new Error(error.message)
    }
    return rowToWorkspace(db, data as Row)
  }

  const { data, error } = await db
    .from('sos_accounting_workspaces')
    .update({ ...payload, revision: input.expectedRevision + 1 })
    .eq('period_start', input.periodStart)
    .eq('period_end', input.periodEnd)
    .eq('revision', input.expectedRevision)
    .select()

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new WorkspaceRevisionConflictError()
  return rowToWorkspace(db, data[0] as Row)
}

export async function listAccountingWorkspaces(db: DbClient): Promise<SosAccountingWorkspace[]> {
  const { data, error } = await db
    .from('sos_accounting_workspaces')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return Promise.all((data ?? []).map((row) => rowToWorkspace(db, row as Row)))
}

export async function deleteWorkspaceForPeriod(
  db: DbClient,
  periodStart: string,
  periodEnd: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('sos_accounting_workspaces')
    .delete()
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .select('id')

  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}