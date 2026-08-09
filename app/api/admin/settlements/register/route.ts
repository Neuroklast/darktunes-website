import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { buildSettlementRegister } from '@/lib/api/settlementRegister'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const querySchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)

  const parsed = querySchema.safeParse({
    periodStart: req.nextUrl.searchParams.get('periodStart'),
    periodEnd: req.nextUrl.searchParams.get('periodEnd'),
  })

  if (!parsed.success) {
    throw new ApiError(400, 'periodStart and periodEnd are required (YYYY-MM-DD)')
  }

  const supabase = await createServerSupabaseClient()
  const register = await buildSettlementRegister(
    supabase,
    parsed.data.periodStart,
    parsed.data.periodEnd,
    organizationId,
  )

  return NextResponse.json(register)
})
