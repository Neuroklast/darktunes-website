/**
 * PUT    /api/admin/sos/presets/:id  — update a Sales Statement preset (name and/or config)
 * DELETE /api/admin/sos/presets/:id  — delete a preset
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  deleteRulesPreset,
  updateRulesPreset,
  type RulesPresetConfig,
} from '@/lib/api/sosRulesPresets'
import { normalizeAccountingConfig } from '@/lib/sos/sosAccountingSettings'
import { ApiError, withErrorHandler } from '@/lib/errors'

export const PUT = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = new URL(req.url).pathname.split('/').at(-1) ?? ''
  if (!id) throw new ApiError(400, 'Missing preset id')
  const body = await req.json()
  const { name, config } = body as { name?: string; config?: Partial<RulesPresetConfig> }

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const preset = await updateRulesPreset(
    serviceSupabase,
    id,
    {
      name,
      config: config ? normalizeAccountingConfig(config) : undefined,
    },
    organizationId,
  )

  return NextResponse.json({
    preset: {
      id: preset.id,
      name: preset.name,
      config: preset.config,
      created_at: preset.createdAt,
      updated_at: preset.updatedAt,
    },
  })
})

export const DELETE = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const id = new URL(req.url).pathname.split('/').at(-1) ?? ''
  if (!id) throw new ApiError(400, 'Missing preset id')

  const serviceSupabase = await createServiceRoleSupabaseClient()
  await deleteRulesPreset(serviceSupabase, id, organizationId)
  return NextResponse.json({ ok: true })
})
