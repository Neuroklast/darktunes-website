import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { logFinancialEvent } from '@/lib/api/financialAudit'
import {
  deleteSalesStatementDraft,
  getSalesStatementByIdForOrganization,
  StatementNotDeletableError,
} from '@/lib/api/salesStatements'
import { assertStatementPeriodWritable } from '@/lib/api/settlementPeriods'
import { deleteStatementPdfFromR2 } from '@/lib/portal/statementPdfStorage'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const { userId, organizationId } = await requireAdminFromRequest(req)

  const id = req.nextUrl.pathname.split('/').pop()
  if (!id) throw new ApiError(400, 'Missing statement id')

  const supabase = await createServerSupabaseClient()
  await assertStatementPeriodWritable(supabase, id)

  const existing = await getSalesStatementByIdForOrganization(supabase, id, organizationId)
  if (!existing) throw new ApiError(404, 'Statement not found')

  try {
    const deleted = await deleteSalesStatementDraft(supabase, id)
    await deleteStatementPdfFromR2(deleted.r2Key)

    await logFinancialEvent(supabase, {
      entityType: 'sales_statement',
      entityId: id,
      action: 'draft_deleted',
      actorId: userId,
      organizationId,
      beforeData: {
        artistId: deleted.artistId,
        period: deleted.period,
        amountEur: deleted.amountEur,
        status: deleted.status,
      },
    })

    return NextResponse.json({ deleted: true, id })
  } catch (err) {
    if (err instanceof StatementNotDeletableError) {
      throw new ApiError(409, err.message)
    }
    throw err
  }
})
