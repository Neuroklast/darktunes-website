/**
 * app/api/admin/cleanup-orphaned-releases/route.ts
 *
 * POST /api/admin/cleanup-orphaned-releases
 * Auth: admin or editor (host organization)
 *
 * Deletes releases for the host organization whose artist_id is NULL.
 * Returns { deleted: number }.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const POST = withErrorHandler(async (request: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminOrEditorFromRequest(request)
  const db = await createServiceRoleSupabaseClient()

  const { data, error } = await db
    .from('releases')
    .delete()
    .eq('organization_id', organizationId)
    .is('artist_id', null)
    .select('id')

  if (error) throw new ApiError(500, `Cleanup failed: ${error.message}`)

  return NextResponse.json({ deleted: (data ?? []).length })
})
