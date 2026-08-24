import { createHash } from 'crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getBillingProfile, isBillingProfileComplete } from '@/lib/api/artistBillingProfiles'
import {
  createArtistInvoice,
  createSosLinkedInvoice,
  DuplicateStatementInvoiceError,
  getArtistInvoiceByStatementId,
  listArtistInvoices,
  updateInvoice,
} from '@/lib/api/artistInvoices'
import { appendLedgerEntry } from '@/lib/api/settlementLedger'
import {
  assertSettlementPeriodWritableById,
  getOrCreateSettlementPeriod,
  SettlementPeriodNotWritableError,
} from '@/lib/api/settlementPeriods'
import {
  InvalidStatementTransitionError,
} from '@/lib/sos/statementStatusTransitions'
import { getSalesStatementById, updateSalesStatementStatus } from '@/lib/api/salesStatements'
import { getSiteSettings } from '@/lib/api/siteSettings'
import { sendInvoiceEmail } from '@/lib/email/sendInvoiceEmail'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { taxRateForStatus } from '@/lib/legal/taxStatus'
import { formatEcbRateNote, getEcbRateForCurrency } from '@/lib/legal/serverFx'
import { generateInvoiceNumber } from '@/lib/portal/invoiceNumber'
import { generateInvoicePdf } from '@/lib/portal/invoicePdf'
import { resolveLabelClientInfo } from '@/lib/portal/labelBilling'
import { createR2Client } from '@/lib/r2Utils'
import { portalMemberWrite, withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'
import { getEmailCredentials } from '@/lib/secrets/getExternalCredentials'

const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  qty: z.number().int().min(1),
  unit_price_cents: z.number().int().min(0),
})

const createInvoiceSchema = z.object({
  artist_id: z.string().uuid(),
  artist_invoice_number: z.string().trim().min(1).max(100),
  client_name: z.string().min(1).max(500),
  client_email: z.string().email(),
  client_address: z.string().max(1000).optional(),
  statement_id: z.string().uuid().optional(),
  line_items: z.array(lineItemSchema).min(1),
  currency: z.string().length(3).default('EUR'),
  tax_rate_pct: z.number().min(0).max(100).default(19),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  issued_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(4000).optional(),
  send_email: z.boolean().default(true),
  send_to_label: z.boolean().default(false),
})

function getLineItemSubtotal(lineItems: Array<{ qty: number; unit_price_cents: number }>): number {
  return lineItems.reduce((sum, lineItem) => sum + lineItem.qty * lineItem.unit_price_cents, 0)
}

const ROUTE = 'POST /api/portal/invoices'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const artistId = req.nextUrl.searchParams.get('artist_id')
  if (!artistId) throw new ApiError(400, 'artist_id is required')

  const ctx = await withPortalMembershipWrite(req, artistId)
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10))
  const { value } = await portalMemberWrite(
    ctx,
    { route: 'GET /api/portal/invoices', table: 'artist_invoices', operation: 'select' },
    (db) => listArtistInvoices(db, ctx.artist.id, page),
  )

  return NextResponse.json({ invoices: value.invoices, total: value.total, page })
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json()
  const parsed = createInvoiceSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((issue) => issue.message).join('; '))
  }

  const input = parsed.data
  const ctx = await withPortalMembershipWrite(req, input.artist_id)
  const { artist, serviceDb } = ctx

  const write = <T>(table: string, operation: string, fn: (db: typeof serviceDb) => Promise<T>) =>
    portalMemberWrite(ctx, { route: ROUTE, table, operation }, fn).then((r) => r.value)

  const billingProfile = await write('artist_billing_profiles', 'select', (db) =>
    getBillingProfile(db, artist.id),
  )
  if (!billingProfile || !isBillingProfileComplete(billingProfile)) {
    throw new ApiError(422, 'Billing profile is incomplete')
  }

  const siteSettings = await write('site_settings', 'select', (db) => getSiteSettings(db))
  const labelClient = resolveLabelClientInfo(siteSettings)

  // Non-EUR invoices: attach ECB reference rate (Frankfurter, no API key).
  const currency = input.currency.toUpperCase()
  const fxQuote =
    currency !== 'EUR' ? await getEcbRateForCurrency(currency) : null
  const fxNote = fxQuote ? formatEcbRateNote(fxQuote) : undefined

  const { serverEnv } = await import('@/lib/env.server')
  const emailCredentials = await getEmailCredentials(serviceDb)

  const statement = input.statement_id
    ? await write('sales_statements', 'select', (db) =>
        getSalesStatementById(db, input.statement_id!, artist.id),
      )
    : null

  if (input.statement_id && !statement) {
    throw new ApiError(404, 'Statement not found')
  }

  if (statement && !['label_approved', 'artist_notified', 'viewed'].includes(statement.status)) {
    throw new ApiError(422, 'Statement is not ready for invoice creation')
  }

  if (statement && statement.amountEur === undefined) {
    throw new ApiError(422, 'Statement amount is missing')
  }

  if (statement) {
    const existingLinkedInvoice = await write('artist_invoices', 'select', (db) =>
      getArtistInvoiceByStatementId(db, artist.id, statement.id),
    )
    if (existingLinkedInvoice) {
      throw new ApiError(409, 'An invoice for this statement already exists')
    }

    const expectedSubtotal = Math.round((statement.amountEur ?? 0) * 100)
    const submittedSubtotal = getLineItemSubtotal(input.line_items)
    if (submittedSubtotal !== expectedSubtotal) {
      throw new ApiError(422, 'Statement-linked invoice amount does not match the approved statement')
    }
  }

  const issuedDate = input.issued_date ?? new Date().toISOString().slice(0, 10)
  const internalInvoiceNumber = await write('artist_invoices', 'select', (db) =>
    generateInvoiceNumber(db, artist.id),
  )
  const taxStatus = billingProfile.taxStatus
  const effectiveTaxRate = taxRateForStatus(taxStatus, input.tax_rate_pct)

  // SOS-linked invoices always bill the label (self-billing / Gutschrift).
  const clientName = statement ? labelClient.name : input.client_name
  const clientEmail = statement ? labelClient.email : input.client_email
  const clientAddress = (statement ? labelClient.address : input.client_address) ?? ''

  if (statement) {
    if (!clientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      throw new ApiError(
        422,
        'Label contact email is missing or invalid — configure Impressum / contact email in site settings',
      )
    }
    if (!labelClient.billingParty.street?.trim() && !clientAddress.trim()) {
      throw new ApiError(
        422,
        'Label billing address is incomplete — configure label billing or Impressum address in site settings',
      )
    }
  }

  const invoicePayload = {
    artistId: artist.id,
    invoiceNumber: internalInvoiceNumber,
    artistInvoiceNumber: input.artist_invoice_number,
    clientName,
    clientEmail,
    clientAddress,
    lineItems: input.line_items,
    currency,
    taxRatePct: effectiveTaxRate,
    dueDate: input.due_date,
    issuedDate,
    notes: input.notes,
  }

  let settlementPeriodId: string | null = statement?.settlementPeriodId ?? null
  if (statement && !settlementPeriodId && statement.periodStart && statement.periodEnd) {
    const period = await write('settlement_periods', 'upsert', (db) =>
      getOrCreateSettlementPeriod(db, statement.periodStart!, statement.periodEnd!),
    )
    settlementPeriodId = period.id
    await write('sales_statements', 'update', async (db) => {
      await db
        .from('sales_statements')
        .update({ settlement_period_id: period.id })
        .eq('id', statement.id)
    })
  }

  if (settlementPeriodId) {
    try {
      await write('settlement_periods', 'select', (db) =>
        assertSettlementPeriodWritableById(db, settlementPeriodId!),
      )
    } catch (err) {
      if (err instanceof SettlementPeriodNotWritableError) {
        throw new ApiError(422, err.message)
      }
      throw err
    }
  }

  let invoice
  try {
    invoice = statement
      ? await write('artist_invoices', 'insert', (db) =>
          createSosLinkedInvoice(db, {
            ...invoicePayload,
            statementId: statement.id,
            settlementPeriodId,
          }),
        )
      : await write('artist_invoices', 'insert', (db) => createArtistInvoice(db, invoicePayload))
  } catch (err) {
    if (err instanceof DuplicateStatementInvoiceError) {
      throw new ApiError(409, err.message)
    }
    throw err
  }

  const pdfBytes = await generateInvoicePdf({
    invoiceNumber: input.artist_invoice_number,
    issuedDate,
    dueDate: input.due_date,
    artist: {
      name: billingProfile.legalName,
      street: billingProfile.street,
      postalCode: billingProfile.postalCode,
      city: billingProfile.city,
      country: billingProfile.country,
      taxNumber: billingProfile.taxNumber,
      vatId: billingProfile.vatId,
      email: billingProfile.paypalEmail,
    },
    label: labelClient.billingParty,
    labelDisplayName: labelClient.name,
    sosReference: statement ? statement.period : undefined,
    sosPeriod: statement?.period,
    lineItems: input.line_items.map((lineItem) => ({
      description: lineItem.description,
      qty: lineItem.qty,
      unitPriceCents: lineItem.unit_price_cents,
    })),
    currency,
    taxRatePct: effectiveTaxRate,
    taxStatus,
    isSmallBusiness: taxStatus === 'small_business',
    notes: input.notes,
    fxNote,
  })

  const pdfSha256 = createHash('sha256').update(pdfBytes).digest('hex')

  const s3 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )
  // Stable key per invoice id — one immutable object (enable R2 versioning in ops).
  const key = `invoices/${artist.id}/${invoice.id}.pdf`
  await s3.send(
    new PutObjectCommand({
      Bucket: serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
      Body: Buffer.from(pdfBytes),
      ContentType: 'application/pdf',
      ContentLength: pdfBytes.byteLength,
    }),
  )

  const pdfUrl = `${serverEnv.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  const updatedInvoice = await write('artist_invoices', 'update', (db) =>
    updateInvoice(db, invoice.id, artist.id, {
      pdf_url: pdfUrl,
      pdf_sha256: pdfSha256,
      service_period_start: statement?.periodStart ?? null,
      service_period_end: statement?.periodEnd ?? null,
      fx_rate: fxQuote?.rate ?? null,
      fx_rate_date: fxQuote?.date ?? null,
      fx_rate_source: fxQuote?.source ?? null,
      status: input.send_email ? 'sent' : 'draft',
    }),
  )

  if (
    statement &&
    ['label_approved', 'artist_notified', 'viewed'].includes(statement.status)
  ) {
    try {
      await write('sales_statements', 'update', (db) =>
        updateSalesStatementStatus(db, statement.id, 'invoiced'),
      )
    } catch (err) {
      if (err instanceof InvalidStatementTransitionError) {
        throw new ApiError(422, err.message)
      }
      throw err
    }
  }

  if (statement && settlementPeriodId) {
    // Net liability zeros statement_payout; cash still owed is tracked via unpaid invoice gross.
    const invoiceTotalEur = getLineItemSubtotal(input.line_items) / 100
    await write('settlement_ledger', 'insert', (db) =>
      appendLedgerEntry(db, {
        artistId: artist.id,
        settlementPeriodId,
        entryType: 'invoice_liability',
        amountEur: -invoiceTotalEur,
        currency,
        referenceType: 'artist_invoice',
        referenceId: invoice.id,
        description: `Invoice liability ${input.artist_invoice_number}`,
      }),
    )
  }

  if (input.send_email) {
    await sendInvoiceEmail(
      {
        artistName: artist.name,
        invoiceNumber: input.artist_invoice_number,
        clientEmail,
        clientName,
        pdfUrl,
        labelName: labelClient.name,
      },
      {
        resendApiKey: emailCredentials.resendApiKey ?? '',
        resendFromEmail: emailCredentials.resendFromEmail ?? '',
        fetch: globalThis.fetch,
      },
    )
  }

  if (input.send_to_label && clientEmail !== labelClient.email) {
    await sendInvoiceEmail(
      {
        artistName: artist.name,
        invoiceNumber: input.artist_invoice_number,
        clientEmail: labelClient.email,
        clientName: labelClient.name,
        pdfUrl,
        labelName: labelClient.name,
      },
      {
        resendApiKey: emailCredentials.resendApiKey ?? '',
        resendFromEmail: emailCredentials.resendFromEmail ?? '',
        fetch: globalThis.fetch,
      },
    )
  }

  return NextResponse.json({ invoice: updatedInvoice, pdf_url: pdfUrl }, { status: 201 })
})
