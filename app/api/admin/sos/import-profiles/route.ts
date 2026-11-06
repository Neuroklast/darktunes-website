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
import { getRulesPresetByName } from '@/lib/api/sosRulesPresets'
import { toDbRecord } from '@/lib/types/jsonColumns'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { profileUpdateSchema } from '@/lib/sos/ingest/profilePersistence'

const PROFILE_STORE_NAME = 'SOS Import Profiles'

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireAdminFromRequest(req)
  const db = await createServiceRoleSupabaseClient()
  const saved = await getRulesPresetByName(db, PROFILE_STORE_NAME)
  // One-time migration path: previously confirmed profiles lived only
  // in the Default preset. Keep them visible until the first global save.
  const fallback = saved ? null : await getRulesPresetByName(db, DEFAULT_PRESET_NAME)
  return NextResponse.json({
    profiles: saved?.config.csvImportProfiles ?? fallback?.config.csvImportProfiles ?? [],
    revision: saved?.updatedAt ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
})

export const PUT = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireAdminFromRequest(req)
  const json: unknown = await req.json()
  const input = profileUpdateSchema.parse(json)
  const db = await createServiceRoleSupabaseClient()
  const current = await getRulesPresetByName(db, PROFILE_STORE_NAME)
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
      .insert({ name: PROFILE_STORE_NAME, config: toDbRecord(config), updated_at: now })
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
