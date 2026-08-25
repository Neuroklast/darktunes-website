/**
 * app/api/admin/maintenance/clear-accreditations/route.ts
 *
 * POST /api/admin/maintenance/clear-accreditations
 * Auth: admin only (host organization)
 * Returns: { deleted: number }
 *
 * Permanently deletes accreditation_requests for the host organization only.
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
    .delete()
    .eq('organization_id', organizationId)
    .select('id')

  if (error) throw new ApiError(500, `Failed to clear accreditations: ${error.message}`)

  return NextResponse.json({ deleted: (data ?? []).length })
})
