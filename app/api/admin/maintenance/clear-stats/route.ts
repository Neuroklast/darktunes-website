/**
 * app/api/admin/maintenance/clear-stats/route.ts
 *
 * POST /api/admin/maintenance/clear-stats
 * Body: { table: 'streaming_stats' | 'sos_period_summaries' }
 * Auth: admin only (host organization)
 * Returns: { deleted: number }
 *
 * Deletes stats rows for the host organization only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

const ALLOWED_STATS_TABLES = [
  'streaming_stats',
  'sos_period_summaries',
] as const

type StatsTable = (typeof ALLOWED_STATS_TABLES)[number]

function isAllowedStatsTable(value: unknown): value is StatsTable {
  return ALLOWED_STATS_TABLES.includes(value as StatsTable)
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)

  let table: unknown
  try {
    const body: unknown = await req.json()
    table = (body as Record<string, unknown>)?.table
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  if (!isAllowedStatsTable(table)) {
    throw new ApiError(400, 'Invalid table')
  }

  const db = await createServiceRoleSupabaseClient()

  if (table === 'sos_period_summaries') {
    const { data, error } = await db
      .from('sos_period_summaries')
      .delete()
      .eq('organization_id', organizationId)
      .select('id')

    if (error) throw new ApiError(500, `Failed to clear ${table}: ${error.message}`)
    return NextResponse.json({ deleted: (data ?? []).length })
  }

  // streaming_stats is artist-scoped; restrict via artists of this organization.
  const { data: artists, error: artistsError } = await db
    .from('artists')
    .select('id')
    .eq('organization_id', organizationId)

  if (artistsError) {
    throw new ApiError(500, `Failed to list artists for stats clear: ${artistsError.message}`)
  }

  const artistIds = (artists ?? []).map((a) => a.id)
  if (artistIds.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  const { data, error } = await db
    .from('streaming_stats')
    .delete()
    .in('artist_id', artistIds)
    .select('id')

  if (error) throw new ApiError(500, `Failed to clear ${table}: ${error.message}`)

  return NextResponse.json({ deleted: (data ?? []).length })
})
