import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import {
  approveAndNotifySalesStatement,
  getSalesStatementByIdForOrganization,
  linkApprovedStatementToSettlement,
} from '@/lib/api/salesStatements'
import { assertStatementPeriodWritable } from '@/lib/api/settlementPeriods'
import { logFinancialEvent } from '@/lib/api/financialAudit'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { notifyStatementArtist } from '@/lib/sos/notifyStatementArtist'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
const bulkApproveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  notes: z.string().max(4000).optional(),
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId, organizationId } = await requireAdminFromRequest(req)

  const body: unknown = await req.json()
  const parsed = bulkApproveSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
  }

  const supabase = await createServerSupabaseClient()
  const serviceSupabase = await createServiceRoleSupabaseClient()
  const batchId = randomUUID()
  const results: {
    id: string
    success: boolean
    emailSent?: boolean
    error?: string
    emailError?: string
  }[] = []

  for (const id of parsed.data.ids) {
    try {
      const existing = await getSalesStatementByIdForOrganization(
        supabase,
        id,
        organizationId,
      )
      if (!existing) {
        results.push({ id, success: false, error: 'Statement not found' })
        continue
      }
      if (existing.status !== 'draft') {
        results.push({ id, success: false, error: `Cannot approve statement in status "${existing.status}"` })
        continue
      }

      await assertStatementPeriodWritable(supabase, id)

      const outcome = await approveAndNotifySalesStatement(
        supabase,
        id,
        (statement) => notifyStatementArtist(serviceSupabase, statement),
        parsed.data.notes,
      )

      await linkApprovedStatementToSettlement(supabase, outcome.statement, userId)

      await logFinancialEvent(supabase, {
        entityType: 'sales_statement',
        entityId: id,
        action: 'approve',
        actorId: userId,
        organizationId,
        afterData: {
          batch_id: batchId,
          email_sent: outcome.emailSent,
          email_error: outcome.emailError,
          notes: parsed.data.notes,
        },
      })

      results.push({
        id,
        success: true,
        emailSent: outcome.emailSent,
        emailError: outcome.emailError,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approval failed'
      results.push({ id, success: false, error: message })
    }
  }

  const approved = results.filter((result) => result.success).length
  const emailed = results.filter((result) => result.emailSent).length
  const approvedIds = results.filter((result) => result.success).map((result) => result.id)

  if (approvedIds.length > 0) {
    await logFinancialEvent(supabase, {
      entityType: 'sales_statement_batch',
      entityId: batchId,
      action: 'bulk_approve',
      actorId: userId,
      organizationId,
      afterData: {
        approved,
        emailed,
        statement_ids: approvedIds,
        notes: parsed.data.notes,
        results,
      },
    })
  }

  return NextResponse.json({
    approved,
    emailed,
    results,
  })
})