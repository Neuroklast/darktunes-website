import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createCorrectionStatement } from '@/lib/api/salesStatements'
import { assertStatementPeriodWritable } from '@/lib/api/settlementPeriods'
import { logFinancialEvent } from '@/lib/api/financialAudit'
import { ApiError, withErrorHandler } from '@/lib/errors'
import {
  buildStatementR2Key,
  uploadStatementPdfToR2,
} from '@/lib/portal/statementPdfStorage'
import { createServerSupabaseClient } from '@/lib/supabase/server'
const correctionSchema = z.object({
  amount_eur: z.number(),
  pdf_base64: z.string().min(1),
  label_notes: z.string().max(4000).optional(),
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId, organizationId } = await requireAdminFromRequest(req)

  const id = req.nextUrl.pathname.split('/').at(-2)
  if (!id) throw new ApiError(400, 'Missing statement id')

  const body: unknown = await req.json()
  const parsed = correctionSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
  }

  const supabase = await createServerSupabaseClient()
  await assertStatementPeriodWritable(supabase, id)

  const { data: original, error: fetchError } = await supabase
    .from('sales_statements')
    .select('artist_id, filename')
    .eq('id', id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') throw new ApiError(404, 'Statement not found')
    throw new Error(fetchError.message)
  }

  const correctionFilename =
    (original.filename as string).replace(/\.pdf$/i, '') + '-Korrektur.pdf'
  const r2Key = buildStatementR2Key(original.artist_id as string, correctionFilename)
  await uploadStatementPdfToR2(parsed.data.pdf_base64, r2Key)

  const statement = await createCorrectionStatement(
    supabase,
    id,
    {
      amountEur: parsed.data.amount_eur,
      r2Key,
      labelNotes: parsed.data.label_notes,
    },
    userId,
  )

  await logFinancialEvent(supabase, {
    entityType: 'sales_statement',
    entityId: statement.id,
    action: 'create_correction',
    actorId: userId,
    organizationId,
    afterData: {
      correction_of_id: id,
      amount_eur: parsed.data.amount_eur,
      r2_key: r2Key,
    },
  })

  return NextResponse.json({ statement }, { status: 201 })
})