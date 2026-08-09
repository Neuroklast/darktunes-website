/**
 * app/api/admin/maintenance/reset-accreditations/route.ts
 *
 * POST /api/admin/maintenance/reset-accreditations
 * Auth: admin only (host organization)
 * Returns: { updated: number }
 *
 * Resets host-org accreditation_requests rows to status = 'pending'.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const db = await createServiceRoleSupabaseClient()

  const { data, error } = await db
    .from('accreditation_requests')
    .update({ status: 'pending' })
    .eq('organization_id', organizationId)
    .not('status', 'eq', 'pending')
    .select('id')

  if (error) throw new ApiError(500, `Failed to reset accreditations: ${error.message}`)

  return NextResponse.json({ updated: (data ?? []).length })
})
