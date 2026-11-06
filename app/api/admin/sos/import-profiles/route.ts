/**
 * Global, versioned SOS CSV profiles. Stored in an isolated named rules
 * preset to avoid database migrations and overwriting period workspaces.
 * The only mutation is optimistic-concurrency checked and admin-authorized.
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { DEFAULT_SOS_ACCOUNTING_SETTINGS, DEFAULT_PRESET_NAME } from '@/lib/sos/sosAccountingSettings'
import { getRulesPresetByName, GLOBAL_IMPORT_PROFILES_PRESET_NAME } from '@/lib/api/sosRulesPresets'
import { toDbRecord } from '@/lib/types/jsonColumns'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { profileUpdateSchema } from '@/lib/sos/ingest/profilePersistence'


export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireAdminFromRequest(req)
  const db = await createServiceRoleSupabaseClient()
  const saved = await getRulesPresetByName(db, GLOBAL_IMPORT_PROFILES_PRESET_NAME)
  // One-time migration path: previously confirmed profiles lived only
  // in the Default preset. Keep them visible until the first global save.
  const fallback = saved ? null : await getRulesPresetByName(db, DEFAULT_PRESET_NAME)
  const legacy = new Map<string, (typeof DEFAULT_SOS_ACCOUNTING_SETTINGS.csvImportProfiles)[number]>()
  // Older releases wrote profiles into period workspaces. Read only the
  // JSON subfield rather than entire revenue/accounting configurations.
  if (!saved) {
    const { data, error } = await db.from('sos_accounting_workspaces')
      .select('profiles:config->csvImportProfiles')
      .limit(300)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const profiles = (row as unknown as { profiles?: typeof DEFAULT_SOS_ACCOUNTING_SETTINGS.csvImportProfiles }).profiles
      for (const profile of Array.isArray(profiles) ? profiles : []) {
        if (profile.type === 'financial' && !profile.isSystemDefault && !legacy.has(profile.id)) {
          legacy.set(profile.id, profile)
        }
      }
    }
    for (const profile of fallback?.config.csvImportProfiles ?? []) {
      if (profile.type === 'financial' && !profile.isSystemDefault && !legacy.has(profile.id)) legacy.set(profile.id, profile)
    }
  }
  return NextResponse.json({
    profiles: saved?.config.csvImportProfiles ?? [...legacy.values()],
    revision: saved?.updatedAt ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
})

export const PUT = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireAdminFromRequest(req)
  const json: unknown = await req.json()
  const input = profileUpdateSchema.parse(json)
  const db = await createServiceRoleSupabaseClient()
  const current = await getRulesPresetByName(db, GLOBAL_IMPORT_PROFILES_PRESET_NAME)
  if ((current?.updatedAt ?? null) !== input.expected_revision) {
    throw new ApiError(409, 'Import profiles were changed elsewhere. Reload before saving.', 'PROFILE_REVISION_CONFLICT')
  }

  const config = {
    ...DEFAULT_SOS_ACCOUNTING_SETTINGS,
    csvImportProfiles: input.profiles,
  }
  const now = new Date().toISOString()
  let updated
  if (current) {
    const { data, error } = await db
      .from('sos_rules_presets')
      .update({ config: toDbRecord(config), updated_at: now })
      .eq('id', current.id)
      .eq('updated_at', current.updatedAt)
      .select('updated_at')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new ApiError(409, 'Import profiles were changed elsewhere. Reload before saving.', 'PROFILE_REVISION_CONFLICT')
    updated = data
  } else {
    const { data, error } = await db
      .from('sos_rules_presets')
      .insert({ name: GLOBAL_IMPORT_PROFILES_PRESET_NAME, config: toDbRecord(config), updated_at: now })
      .select('updated_at')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Import profiles were changed elsewhere. Reload before saving.', 'PROFILE_REVISION_CONFLICT')
      }
      throw new Error(error.message)
    }
    updated = data
  }
  return NextResponse.json({
    profiles: input.profiles,
    revision: updated.updated_at,
  }, { headers: { 'Cache-Control': 'no-store' } })
})
