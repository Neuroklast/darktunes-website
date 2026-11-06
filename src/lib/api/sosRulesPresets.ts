/**
 * DAL for sos_rules_presets — named, reusable SOS accounting settings bundles.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  DEFAULT_PRESET_NAME,
  DEFAULT_SOS_ACCOUNTING_SETTINGS,
  normalizeAccountingConfig,
  type SosAccountingSettings,
} from '@/lib/sos/sosAccountingSettings'
import { toDbRecord } from '@/lib/types/jsonColumns'
import { compactSosLogo, hydrateSosLogo } from '@/lib/sos/logoAssets.server'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['sos_rules_presets']['Row']

export const GLOBAL_IMPORT_PROFILES_PRESET_NAME = 'SOS Import Profiles'

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

async function rowToPreset(db: DbClient, row: Row): Promise<SosRulesPreset> {
  return {
    id: row.id,
    name: row.name,
    config: await hydrateSosLogo(db, normalizeAccountingConfig(row.config as Partial<SosAccountingSettings>)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listRulesPresets(db: DbClient): Promise<SosRulesPreset[]> {
  const { data, error } = await db
    .from('sos_rules_presets')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  // Isolated internal storage is not a user-selectable rules preset.
  return Promise.all((data ?? []).filter((row) => row.name !== GLOBAL_IMPORT_PROFILES_PRESET_NAME).map((row) => rowToPreset(db, row as Row)))
}

export async function getRulesPresetByName(
  db: DbClient,
  name: string,
): Promise<SosRulesPreset | null> {
  const trimmed = name.trim()
  const { data, error } = await db
    .from('sos_rules_presets')
    .select('*')
    .ilike('name', trimmed)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? rowToPreset(db, data as Row) : null
}

export async function getRulesPresetById(
  db: DbClient,
  id: string,
): Promise<SosRulesPreset | null> {
  const { data, error } = await db
    .from('sos_rules_presets')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? rowToPreset(db, data as Row) : null
}

export async function upsertRulesPresetByName(
  db: DbClient,
  input: UpsertRulesPresetInput,
): Promise<SosRulesPreset> {
  const trimmedName = input.name.trim()
  if (trimmedName.toLowerCase() === GLOBAL_IMPORT_PROFILES_PRESET_NAME.toLowerCase()) {
    throw new Error('The global import profile store is not an editable rules preset')
  }
  const existing = await getRulesPresetByName(db, trimmedName)
  const config = await compactSosLogo(db, normalizeAccountingConfig(input.config))

  if (existing) {
    const { data, error } = await db
      .from('sos_rules_presets')
      .update({ name: trimmedName, config: toDbRecord(config) })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return rowToPreset(db, data as Row)
  }

  const { data, error } = await db
    .from('sos_rules_presets')
    .insert({ name: trimmedName, config: toDbRecord(config) })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToPreset(db, data as Row)
}

export async function updateRulesPreset(
  db: DbClient,
  id: string,
  input: { name?: string; config?: RulesPresetConfig },
): Promise<SosRulesPreset> {
  const existing = await getRulesPresetById(db, id)
  if (existing?.name === GLOBAL_IMPORT_PROFILES_PRESET_NAME || input.name?.trim() === GLOBAL_IMPORT_PROFILES_PRESET_NAME) {
    throw new Error('The global import profile store is not an editable rules preset')
  }
  const update: { name?: string; config?: Record<string, unknown> } = {}
  if (input.name !== undefined) update.name = input.name.trim()
  if (input.config !== undefined) {
    update.config = toDbRecord(await compactSosLogo(db, normalizeAccountingConfig(input.config)))
  }

  const { data, error } = await db
    .from('sos_rules_presets')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return rowToPreset(db, data as Row)
}

export async function deleteRulesPreset(db: DbClient, id: string): Promise<void> {
  const existing = await getRulesPresetById(db, id)
  if (existing?.name === GLOBAL_IMPORT_PROFILES_PRESET_NAME) {
    throw new Error('The global import profile store cannot be deleted')
  }
  if (existing?.name.toLowerCase() === DEFAULT_PRESET_NAME.toLowerCase()) {
    throw new Error('The Default preset cannot be deleted')
  }

  const { error } = await db.from('sos_rules_presets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function ensureDefaultRulesPreset(db: DbClient): Promise<SosRulesPreset> {
  const existing = await getRulesPresetByName(db, DEFAULT_PRESET_NAME)
  if (existing) return existing

  return upsertRulesPresetByName(db, {
    name: DEFAULT_PRESET_NAME,
    config: DEFAULT_SOS_ACCOUNTING_SETTINGS,
  })
}