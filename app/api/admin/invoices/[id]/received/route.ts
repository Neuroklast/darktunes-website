import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { getAdminInvoiceById, markInvoiceReceived } from '@/lib/api/artistInvoices'
import { assertSettlementPeriodWritableById } from '@/lib/api/settlementPeriods'
import { logFinancialEvent } from '@/lib/api/financialAudit'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
export const PATCH = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId, organizationId } = await requireAdminFromRequest(req)

  const id = req.nextUrl.pathname.split('/').at(-2)
  if (!id) throw new ApiError(400, 'Missing invoice id')

  const supabase = await createServerSupabaseClient()
  const existing = await getAdminInvoiceById(supabase, id)
  if (!existing) throw new ApiError(404, 'Invoice not found')
  if (existing.settlementPeriodId) {
    await assertSettlementPeriodWritableById(supabase, existing.settlementPeriodId)
  }

  const invoice = await markInvoiceReceived(supabase, id, userId)

  await logFinancialEvent(supabase, {
    entityType: 'artist_invoice',
    entityId: id,
    action: 'mark_received',
    actorId: userId,
    organizationId,
    afterData: { status: invoice.status, received_at: invoice.receivedAt },
  })

  return NextResponse.json({ invoice })
})