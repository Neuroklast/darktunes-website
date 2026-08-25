import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { getAllVideoSubmissions } from '@/lib/api/videoSubmissions'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const submissions = await getAllVideoSubmissions(supabase, organizationId)
  return NextResponse.json(submissions)
})
