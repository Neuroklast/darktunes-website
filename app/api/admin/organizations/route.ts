import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { listOrganizationsAccessibleToUser } from '@/lib/api/organizations'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { userId } = await requireAdminFromRequest(req)
  const db = await createServiceRoleSupabaseClient()
  const organizations = await listOrganizationsAccessibleToUser(db, userId)
  return NextResponse.json(organizations)
})
