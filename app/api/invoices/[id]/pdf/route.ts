/**
 * app/api/invoices/[id]/pdf/route.ts
 *
 * GET — tokenized, expiring public download for invoice PDFs sent by email.
 * The token is minted by POST /api/portal/invoices (invoicePdfToken.ts) so
 * external bookkeepers without a portal account can fetch the PDF without a
 * world-readable R2 URL.
 */

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminInvoiceById } from '@/lib/api/artistInvoices'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { verifyInvoicePdfToken } from '@/lib/portal/invoicePdfToken'
import { createR2Client } from '@/lib/r2Utils'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const { serverEnv } = await import('@/lib/env.server')

  const verified = verifyInvoicePdfToken(serverEnv.API_CREDENTIALS_ENCRYPTION_KEY, token)
  const id = req.nextUrl.pathname.split('/').at(-2)
  if (!verified.ok || !id || id !== verified.invoiceId) {
    throw new ApiError(403, 'Invalid or expired download link')
  }

  const db = await createServiceRoleSupabaseClient()
  const invoice = await getAdminInvoiceById(db, id)
  if (!invoice?.pdfUrl) throw new ApiError(404, 'Invoice PDF not found')

  const publicBase = serverEnv.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, '')
  const key = invoice.pdfUrl.startsWith(publicBase)
    ? invoice.pdfUrl.slice(publicBase.length + 1)
    : `invoices/${invoice.artistId}/${invoice.id}.pdf`

  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )
  const object = await s3.send(
    new GetObjectCommand({ Bucket: serverEnv.CLOUDFLARE_R2_BUCKET_NAME, Key: key }),
  )
  if (!object.Body) throw new ApiError(404, 'Invoice PDF not found')

  const bytes = await object.Body.transformToByteArray()
  const safeNumber = (invoice.artistInvoiceNumber ?? invoice.invoiceNumber).replace(
    /[^a-zA-Z0-9-_]/g,
    '-',
  )

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${safeNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
})
