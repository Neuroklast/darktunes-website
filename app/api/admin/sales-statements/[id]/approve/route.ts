import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import {
  approveAndNotifySalesStatement,
  getSalesStatementByIdForOrganization,
  linkApprovedStatementToSettlement,
} from '@/lib/api/salesStatements'
import { assertStatementPeriodWritable } from '@/lib/api/settlementPeriods'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { notifyStatementArtist } from '@/lib/sos/notifyStatementArtist'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'

const approveSchema = z.object({
  notes: z.string().max(4000).optional(),
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { userId, organizationId } = await requireAdminFromRequest(req)

  const id = req.nextUrl.pathname.split('/').at(-2)
  if (!id) throw new ApiError(400, 'Missing statement id')

  const body: unknown = await req.json()
  const parsed = approveSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
  }

  const supabase = await createServerSupabaseClient()
  const existing = await getSalesStatementByIdForOrganization(supabase, id, organizationId)
  if (!existing) throw new ApiError(404, 'Statement not found')

  await assertStatementPeriodWritable(supabase, id)

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const outcome = await approveAndNotifySalesStatement(
    supabase,
    id,
    (statement) => notifyStatementArtist(serviceSupabase, statement),
    parsed.data.notes,
  )

  await linkApprovedStatementToSettlement(supabase, outcome.statement, userId)

  return NextResponse.json({
    statement: outcome.statement,
    emailSent: outcome.emailSent,
    emailError: outcome.emailError,
  })
})
