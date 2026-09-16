import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import {
  ADMIN_INVOICE_PAGE_SIZE_DEFAULT,
  ADMIN_INVOICE_PAGE_SIZE_MAX,
  listAdminInvoices,
} from '@/lib/api/artistInvoices'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { toAdminInvoiceUiItem } from '@/lib/portal/invoiceUi'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const querySchema = z.object({
  artist_id: z.string().uuid().optional(),
  status: z
    .enum(['draft', 'sent', 'received', 'partially_paid', 'paid', 'cancelled'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_INVOICE_PAGE_SIZE_MAX)
    .default(ADMIN_INVOICE_PAGE_SIZE_DEFAULT),
})

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdmin(token)

  const parsed = querySchema.safeParse({
    artist_id: req.nextUrl.searchParams.get('artist_id') ?? undefined,
    status: req.nextUrl.searchParams.get('status') ?? undefined,
    page: req.nextUrl.searchParams.get('page') ?? undefined,
    page_size: req.nextUrl.searchParams.get('page_size') ?? undefined,
  })
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
  }

  const supabase = await createServerSupabaseClient()
  const result = await listAdminInvoices(supabase, {
    page: parsed.data.page,
    pageSize: parsed.data.page_size,
    artistId: parsed.data.artist_id,
    status: parsed.data.status,
  })

  return NextResponse.json({
    items: result.invoices.map(toAdminInvoiceUiItem),
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
  })
})
