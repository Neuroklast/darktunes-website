/**
 * app/api/admin/maintenance/clear-logs/route.ts
 *
 * POST /api/admin/maintenance/clear-logs
 * Body: { table: 'app_logs' | 'sync_logs' | 'rbac_audit_log' | 'admin_audit_log' }
 * Auth: admin only (host organization)
 * Returns: { deleted: number }
 *
 * - sync_logs: cleared for artists belonging to the host organization.
 * - app_logs / rbac_audit_log / admin_audit_log: platform-wide (no organization_id);
 *   only allowed when the host is Org #0 (darkTunes) to avoid pilot labels wiping
 *   shared platform logs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { logAdminAction } from '@/lib/adminAuditLog'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

const ALLOWED_LOG_TABLES = [
  'app_logs',
  'sync_logs',
  'rbac_audit_log',
  'admin_audit_log',
] as const

type LogTable = (typeof ALLOWED_LOG_TABLES)[number]

const PLATFORM_WIDE_LOG_TABLES: ReadonlySet<LogTable> = new Set([
  'app_logs',
  'rbac_audit_log',
  'admin_audit_log',
])

function isAllowedLogTable(value: unknown): value is LogTable {
  return ALLOWED_LOG_TABLES.includes(value as LogTable)
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId: actorId, organizationId } = await requireAdminFromRequest(req)

  let table: unknown
  try {
    const body: unknown = await req.json()
    table = (body as Record<string, unknown>)?.table
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  if (!isAllowedLogTable(table)) {
    throw new ApiError(400, 'Invalid table')
  }

  if (PLATFORM_WIDE_LOG_TABLES.has(table) && organizationId !== DEFAULT_ORGANIZATION_ID) {
    throw new ApiError(
      403,
      `${table} is platform-wide; clear only from the darkTunes (Org #0) host`,
    )
  }

  const db = await createServiceRoleSupabaseClient()

  let deleted = 0

  if (table === 'sync_logs') {
    const { data: artists, error: artistsError } = await db
      .from('artists')
      .select('id')
      .eq('organization_id', organizationId)

    if (artistsError) {
      throw new ApiError(500, `Failed to list artists for log clear: ${artistsError.message}`)
    }

    const artistIds = (artists ?? []).map((a) => a.id)
    if (artistIds.length === 0) {
      await logAdminAction(db, {
        actorId,
        action: 'cleared',
        resource: table,
        details: { deleted: 0, organizationId },
      })
      return NextResponse.json({ deleted: 0 })
    }

    const { data, error } = await db
      .from('sync_logs')
      .delete()
      .in('artist_id', artistIds)
      .select('id')

    if (error) throw new ApiError(500, `Failed to clear ${table}: ${error.message}`)
    deleted = (data ?? []).length
  } else {
    // Platform-wide tables (Org #0 host only — checked above).
    const { data, error } = await db
      .from(table)
      .delete()
      .not('id', 'is', null)
      .select('id')

    if (error) throw new ApiError(500, `Failed to clear ${table}: ${error.message}`)
    deleted = (data ?? []).length
  }

  await logAdminAction(db, {
    actorId,
    action: 'cleared',
    resource: table,
    details: { deleted, organizationId },
  })

  return NextResponse.json({ deleted })
})
