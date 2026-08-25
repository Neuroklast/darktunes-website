/**
 * app/api/admin/maintenance/purge-releases/route.ts
 *
 * POST /api/admin/maintenance/purge-releases
 * Auth: admin only (host organization)
 * Returns: { releasesDeleted: number, junctionDeleted: number }
 *
 * Permanently deletes releases (and release_artists junction rows) for the
 * **request host organization only**. Guarded by a two-step confirmation in the UI.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const db = await createServiceRoleSupabaseClient()

  const { data: orgReleases, error: listError } = await db
    .from('releases')
    .select('id')
    .eq('organization_id', organizationId)

  if (listError) {
    throw new ApiError(500, `Failed to list releases: ${listError.message}`)
  }

  const releaseIds = (orgReleases ?? []).map((r) => r.id)
  if (releaseIds.length === 0) {
    return NextResponse.json({ releasesDeleted: 0, junctionDeleted: 0 })
  }

  // Delete release_artists first to avoid FK violations and count junction rows.
  const { data: junctionData, error: junctionError } = await db
    .from('release_artists')
    .delete()
    .in('release_id', releaseIds)
    .select('release_id')

  if (junctionError) {
    throw new ApiError(500, `Failed to purge release_artists: ${junctionError.message}`)
  }

  const { data: releasesData, error: releasesError } = await db
    .from('releases')
    .delete()
    .eq('organization_id', organizationId)
    .select('id')

  if (releasesError) {
    throw new ApiError(500, `Failed to purge releases: ${releasesError.message}`)
  }

  return NextResponse.json({
    releasesDeleted: (releasesData ?? []).length,
    junctionDeleted: (junctionData ?? []).length,
  })
})
