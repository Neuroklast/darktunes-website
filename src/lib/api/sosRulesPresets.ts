/**
 * DAL for sos_rules_presets — named, reusable Sales Statement accounting settings.
 * Scoped by organization_id (table name keeps legacy sos_* path).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  DEFAULT_PRESET_NAME,
  DEFAULT_SOS_ACCOUNTING_SETTINGS,
  normalizeAccountingConfig,
  type SosAccountingSettings,
} from '@/lib/sos/sosAccountingSettings'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { toDbRecord } from '@/lib/types/jsonColumns'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['sos_rules_presets']['Row']

export type RulesPresetConfig = SosAccountingSettings

export interface SosRulesPreset {
  id: string
  name: string
  config: RulesPresetConfig
  createdAt: string
  updatedAt: string
}

export interface UpsertRulesPresetInput {
  name: string
  config: RulesPresetConfig
}

function rowToPreset(row: Row): SosRulesPreset {
  return {
    id: row.id,
    name: row.name,
    config: normalizeAccountingConfig(row.config as Partial<SosAccountingSettings>),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listRulesPresets(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosRulesPreset[]> {
  const { data, error } = await db
    .from('sos_rules_presets')
    .select('*')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToPreset(row as Row))
}

export async function getRulesPresetByName(
  db: DbClient,
  name: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosRulesPreset | null> {
  const trimmed = name.trim()
  const { data, error } = await db
    .from('sos_rules_presets')
    .select('*')
    .eq('organization_id', organizationId)
    .ilike('name', trimmed)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? rowToPreset(data as Row) : null
}

export async function getRulesPresetById(
  db: DbClient,
  id: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosRulesPreset | null> {
  const { data, error } = await db
    .from('sos_rules_presets')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? rowToPreset(data as Row) : null
}

export async function upsertRulesPresetByName(
  db: DbClient,
  input: UpsertRulesPresetInput,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosRulesPreset> {
  const trimmedName = input.name.trim()
  const existing = await getRulesPresetByName(db, trimmedName, organizationId)
  const config = normalizeAccountingConfig(input.config)

  if (existing) {
    const { data, error } = await db
      .from('sos_rules_presets')
      .update({ name: trimmedName, config: toDbRecord(config) })
      .eq('id', existing.id)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return rowToPreset(data as Row)
  }

  const { data, error } = await db
    .from('sos_rules_presets')
    .insert({
      organization_id: organizationId,
      name: trimmedName,
      config: toDbRecord(config),
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToPreset(data as Row)
}

export async function updateRulesPreset(
  db: DbClient,
  id: string,
  input: { name?: string; config?: RulesPresetConfig },
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosRulesPreset> {
  const update: { name?: string; config?: Record<string, unknown> } = {}
  if (input.name !== undefined) update.name = input.name.trim()
  if (input.config !== undefined) {
    update.config = toDbRecord(normalizeAccountingConfig(input.config))
  }

  const { data, error } = await db
    .from('sos_rules_presets')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToPreset(data as Row)
}

export async function deleteRulesPreset(
  db: DbClient,
  id: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<void> {
  const existing = await getRulesPresetById(db, id, organizationId)
  if (existing?.name.toLowerCase() === DEFAULT_PRESET_NAME.toLowerCase()) {
    throw new Error('The Default preset cannot be deleted')
  }

  const { error } = await db
    .from('sos_rules_presets')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
}

export async function ensureDefaultRulesPreset(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<SosRulesPreset> {
  const existing = await getRulesPresetByName(db, DEFAULT_PRESET_NAME, organizationId)
  if (existing) return existing

  return upsertRulesPresetByName(
    db,
    {
      name: DEFAULT_PRESET_NAME,
      config: DEFAULT_SOS_ACCOUNTING_SETTINGS,
    },
    organizationId,
  )
}
