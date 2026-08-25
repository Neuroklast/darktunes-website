import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { listSettlementPeriods } from '@/lib/api/settlementPeriods'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)

  const supabase = await createServerSupabaseClient()
  const periods = await listSettlementPeriods(supabase, organizationId)
  return NextResponse.json({ periods })
})
