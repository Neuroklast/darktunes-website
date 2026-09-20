/**
 * app/api/admin/maintenance/clear-logs/route.ts
 *
 * POST /api/admin/maintenance/clear-logs
 * Body: { table: 'app_logs' | 'sync_logs' | 'rbac_audit_log' | 'admin_audit_log' }
 * Auth: admin only
 * Returns: { deleted: number }
 *
 * Deletes all rows from the specified log table. Validates the table name
 * against an allowlist to prevent arbitrary table deletion.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { logAdminActionForRequest } from '@/lib/adminAuditLog'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
const ALLOWED_LOG_TABLES = [
  'app_logs',
  'sync_logs',
  'rbac_audit_log',
  'admin_audit_log',
] as const

type LogTable = (typeof ALLOWED_LOG_TABLES)[number]

function isAllowedLogTable(value: unknown): value is LogTable {
  return ALLOWED_LOG_TABLES.includes(value as LogTable)
}

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const actorId = await verifyAdmin(token)

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

  const db = await createServiceRoleSupabaseClient()

  // Delete all rows. PostgREST requires at least one filter on DELETE;
  // `not('id', 'is', null)` is equivalent to `WHERE id IS NOT NULL` which
  // matches every row since `id` is declared NOT NULL in all log tables.
  const { data, error } = await db
    .from(table)
    .delete()
    .not('id', 'is', null)
    .select('id')

  if (error) throw new ApiError(500, `Failed to clear ${table}: ${error.message}`)

  const deleted = (data ?? []).length

  await logAdminActionForRequest(req, db, {
    actorId,
    action: 'cleared',
    resource: table,
    details: { deleted },
  })

  return NextResponse.json({ deleted })
})
