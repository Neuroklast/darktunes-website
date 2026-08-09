import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { assertAdminOrganizationAccess } from '@/lib/organizations/assertAdminOrganizationAccess'
import { listOrganizationAuditLogs } from '@/lib/api/organizationAuditLog'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const orgId = new URL(req.url).searchParams.get('organizationId')
  if (!orgId) throw new ApiError(400, 'organizationId required')

  const limit = Math.min(100, parseInt(new URL(req.url).searchParams.get('limit') ?? '50', 10) || 50)
  const db = await createServiceRoleSupabaseClient()
  await assertAdminOrganizationAccess(db, userId, orgId)

  const entries = await listOrganizationAuditLogs(db, orgId, limit)
  return NextResponse.json(entries)
})
