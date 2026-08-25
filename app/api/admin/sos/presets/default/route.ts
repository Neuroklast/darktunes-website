/**
 * GET /api/admin/sos/presets/default — ensure and return the Default Sales Statement preset
 * PUT /api/admin/sos/presets/default — save settings to the Default preset
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  ensureDefaultRulesPreset,
  upsertRulesPresetByName,
  type RulesPresetConfig,
} from '@/lib/api/sosRulesPresets'
import { DEFAULT_PRESET_NAME, normalizeAccountingConfig } from '@/lib/sos/sosAccountingSettings'
import { ApiError, withErrorHandler } from '@/lib/errors'

function presetResponse(preset: Awaited<ReturnType<typeof ensureDefaultRulesPreset>>) {
  return {
    preset: {
      id: preset.id,
      name: preset.name,
      config: preset.config,
      created_at: preset.createdAt,
      updated_at: preset.updatedAt,
    },
  }
}

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const serviceSupabase = await createServiceRoleSupabaseClient()
  const preset = await ensureDefaultRulesPreset(serviceSupabase, organizationId)
  return NextResponse.json(presetResponse(preset))
})

export const PUT = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const body = await req.json()
  const { config } = body as { config?: Partial<RulesPresetConfig> }
  if (!config || typeof config !== 'object') throw new ApiError(400, 'config must be an object')

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const preset = await upsertRulesPresetByName(
    serviceSupabase,
    {
      name: DEFAULT_PRESET_NAME,
      config: normalizeAccountingConfig(config),
    },
    organizationId,
  )

  return NextResponse.json(presetResponse(preset))
})
