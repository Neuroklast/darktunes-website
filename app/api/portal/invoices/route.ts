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
  type ArtistInvoice,
} from '@/lib/api/artistInvoices'
import { appendLedgerEntry, hasLedgerEntry } from '@/lib/api/settlementLedger'
import {
  assertSettlementPeriodWritableById,
  getOrCreateSettlementPeriod,
  SettlementPeriodNotWritableError,
} from '@/lib/api/settlementPeriods'
import { getSalesStatementById, updateSalesStatementStatus } from '@/lib/api/salesStatements'
import { getSiteSettings } from '@/lib/api/siteSettings'
import { getRulesPresetByName } from '@/lib/api/sosRulesPresets'
import { DEFAULT_PRESET_NAME } from '@/lib/sos/sosAccountingSettings'
import { sendInvoiceEmail } from '@/lib/email/sendInvoiceEmail'
import { emitNotification } from '@/lib/notifications/emit'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { taxRateForStatus } from '@/lib/legal/taxStatus'
import { formatEcbRateNote, getEcbRateForCurrency } from '@/lib/legal/serverFx'
import { generateInvoiceNumber } from '@/lib/portal/invoiceNumber'
import { generateInvoicePdf } from '@/lib/portal/invoicePdf'
import { mintInvoicePdfToken } from '@/lib/portal/invoicePdfToken'
import { toPortalInvoiceListItem } from '@/lib/portal/invoiceUi'
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

  return NextResponse.json({
    invoices: value.invoices.map(toPortalInvoiceListItem),
    total: value.total,
    page,
  })
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

  // Label mail target: SOS accounting financeEmail wins over Impressum/contact.
  // Best-effort — invoice creation must not fail when the preset is unavailable.
  let financeEmail = ''
  try {
    const preset = await write('sos_rules_presets', 'select', (db) =>
      getRulesPresetByName(db, DEFAULT_PRESET_NAME),
    )
    financeEmail = preset?.config.appDefaults.financeEmail?.trim() ?? ''
  } catch (err) {
    console.warn('[portal invoices] financeEmail lookup failed:', err)
  }

  const labelClient = resolveLabelClientInfo(siteSettings, financeEmail)

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

  const warnings: string[] = []
  let recoveredInvoice: ArtistInvoice | null = null

  if (statement) {
    const existingLinkedInvoice = await write('artist_invoices', 'select', (db) =>
      getArtistInvoiceByStatementId(db, artist.id, statement.id),
    )
    if (existingLinkedInvoice?.pdfUrl) {
      // Idempotent replay — the invoice and its PDF already exist. Repair any
      // follow-up step that failed after the PDF was attached (statement
      // status, ledger liability, staff notification) and return the row.
      // This runs before the status gate: a successful create advances the
      // statement to "invoiced", which must not turn a retry into a 422.
      const replayWarnings: string[] = ['already_exists']
      const replayInvoiceId = existingLinkedInvoice.id
      const replayPeriodId = statement.settlementPeriodId
      const replayInvoiceNumber =
        existingLinkedInvoice.artistInvoiceNumber ?? existingLinkedInvoice.invoiceNumber

      if (['label_approved', 'artist_notified', 'viewed'].includes(statement.status)) {
        try {
          await write('sales_statements', 'update', (db) =>
            updateSalesStatementStatus(db, statement.id, 'invoiced'),
          )
        } catch (err) {
          console.error('[portal invoices] replay statement status update failed:', err)
          replayWarnings.push('statement_status_failed')
        }
      }

      if (replayPeriodId) {
        try {
          await write('settlement_periods', 'select', (db) =>
            assertSettlementPeriodWritableById(db, replayPeriodId),
          )
          const alreadyBooked = await write('settlement_ledger', 'select', (db) =>
            hasLedgerEntry(db, 'artist_invoice', replayInvoiceId, 'invoice_liability'),
          )
          if (!alreadyBooked) {
            await write('settlement_ledger', 'insert', (db) =>
              appendLedgerEntry(db, {
                artistId: artist.id,
                settlementPeriodId: replayPeriodId,
                entryType: 'invoice_liability',
                amountEur: -Number(statement.amountEur ?? 0),
                currency,
                referenceType: 'artist_invoice',
                referenceId: replayInvoiceId,
                description: `Invoice liability ${replayInvoiceNumber}`,
              }),
            )
          }
        } catch (err) {
          console.error('[portal invoices] replay ledger repair failed:', err)
          replayWarnings.push('ledger_entry_failed')
        }
      }

      try {
        await emitNotification(serviceDb, {
          type: 'invoice_submitted',
          entityId: replayInvoiceId,
          entityName: `Invoice ${replayInvoiceNumber} — ${artist.name}`,
          artistId: artist.id,
          payload: {
            invoice_number: replayInvoiceNumber,
            amount_cents: Math.round(Number(statement.amountEur ?? 0) * 100),
            currency,
            statement_id: statement.id,
            client_email: existingLinkedInvoice.clientEmail,
          },
          dedupeKey: `invoice_submitted:${replayInvoiceId}`,
        })
      } catch (notifErr) {
        console.error('[portal invoices] replay staff notify failed:', notifErr)
        replayWarnings.push('notify_failed')
      }

      return NextResponse.json(
        {
          invoice: toPortalInvoiceListItem(existingLinkedInvoice),
          pdf_available: true,
          email: {},
          warnings: replayWarnings,
        },
        { status: 200 },
      )
    }
    if (existingLinkedInvoice) {
      // Recovery — a previous attempt persisted the row but failed before the
      // PDF was attached. Continue with the existing row instead of 409-ing.
      recoveredInvoice = existingLinkedInvoice
      warnings.push('recovered_partial')
    }
  }

  if (statement && !['label_approved', 'artist_notified', 'viewed'].includes(statement.status)) {
    throw new ApiError(422, 'Statement is not ready for invoice creation')
  }

  if (statement && statement.amountEur === undefined) {
    throw new ApiError(422, 'Statement amount is missing')
  }

  if (statement) {
    const expectedSubtotal = Math.round((statement.amountEur ?? 0) * 100)
    const submittedSubtotal = getLineItemSubtotal(input.line_items)
    if (submittedSubtotal !== expectedSubtotal) {
      throw new ApiError(422, 'Statement-linked invoice amount does not match the approved statement')
    }
  }

  const issuedDate = input.issued_date ?? new Date().toISOString().slice(0, 10)
  // A recovered row keeps its persisted number so PDF, mails and ledger stay consistent.
  const artistInvoiceNumber =
    recoveredInvoice?.artistInvoiceNumber ?? input.artist_invoice_number
  const internalInvoiceNumber = recoveredInvoice
    ? recoveredInvoice.invoiceNumber
    : await write('artist_invoices', 'select', (db) => generateInvoiceNumber(db, artist.id))
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

  let invoice: ArtistInvoice
  if (recoveredInvoice) {
    invoice = recoveredInvoice
  } else {
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
  }

  const pdfBytes = await generateInvoicePdf({
    invoiceNumber: artistInvoiceNumber,
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
  // Never downgrade a recovered invoice that was already marked sent.
  const nextStatus =
    input.send_email || recoveredInvoice?.status === 'sent' ? 'sent' : 'draft'
  const updatedInvoice = await write('artist_invoices', 'update', (db) =>
    updateInvoice(db, invoice.id, artist.id, {
      pdf_url: pdfUrl,
      pdf_sha256: pdfSha256,
      service_period_start: statement?.periodStart ?? null,
      service_period_end: statement?.periodEnd ?? null,
      fx_rate: fxQuote?.rate ?? null,
      fx_rate_date: fxQuote?.date ?? null,
      fx_rate_source: fxQuote?.source ?? null,
      status: nextStatus,
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
      // The invoice row + PDF exist — surface the failure without losing them.
      console.error('[portal invoices] statement status update failed:', err)
      warnings.push('statement_status_failed')
    }
  }

  if (statement && settlementPeriodId) {
    // Net liability zeros statement_payout; cash still owed is tracked via unpaid invoice gross.
    const invoiceTotalEur = getLineItemSubtotal(input.line_items) / 100
    const alreadyBooked = await write('settlement_ledger', 'select', (db) =>
      hasLedgerEntry(db, 'artist_invoice', invoice.id, 'invoice_liability'),
    )
    if (!alreadyBooked) {
      try {
        await write('settlement_ledger', 'insert', (db) =>
          appendLedgerEntry(db, {
            artistId: artist.id,
            settlementPeriodId,
            entryType: 'invoice_liability',
            amountEur: -invoiceTotalEur,
            currency,
            referenceType: 'artist_invoice',
            referenceId: invoice.id,
            description: `Invoice liability ${artistInvoiceNumber}`,
          }),
        )
      } catch (err) {
        console.error('[portal invoices] ledger entry failed:', err)
        warnings.push('ledger_entry_failed')
      }
    }
  }

  try {
    await emitNotification(serviceDb, {
      type: 'invoice_submitted',
      entityId: invoice.id,
      entityName: `Invoice ${artistInvoiceNumber} — ${artist.name}`,
      artistId: artist.id,
      payload: {
        invoice_number: artistInvoiceNumber,
        amount_cents: getLineItemSubtotal(input.line_items),
        currency,
        statement_id: statement?.id ?? null,
        client_email: clientEmail,
      },
      dedupeKey: `invoice_submitted:${invoice.id}`,
    })
  } catch (notifErr) {
    console.error('[portal invoices] staff notify failed:', notifErr)
    warnings.push('notify_failed')
  }

  const emailResults: {
    client?: { sent: boolean; error?: string }
    label?: { sent: boolean; error?: string }
  } = {}

  // Tokenized download link — no world-readable R2 URL in customer mails.
  const downloadToken = mintInvoicePdfToken(
    serverEnv.API_CREDENTIALS_ENCRYPTION_KEY,
    invoice.id,
  )
  const downloadUrl = `${req.nextUrl.origin}/api/invoices/${invoice.id}/pdf?token=${encodeURIComponent(downloadToken)}`

  if (input.send_email) {
    const result = await sendInvoiceEmail(
      {
        artistName: artist.name,
        invoiceNumber: artistInvoiceNumber,
        clientEmail,
        clientName,
        pdfUrl: downloadUrl,
        labelName: labelClient.name,
      },
      {
        resendApiKey: emailCredentials.resendApiKey ?? '',
        resendFromEmail: emailCredentials.resendFromEmail ?? '',
        fetch: globalThis.fetch,
      },
    )
    emailResults.client = result.success ? { sent: true } : { sent: false, error: result.error }
    if (!result.success) warnings.push('client_email_failed')
  }

  if (input.send_to_label && clientEmail !== labelClient.email) {
    const result = await sendInvoiceEmail(
      {
        artistName: artist.name,
        invoiceNumber: artistInvoiceNumber,
        clientEmail: labelClient.email,
        clientName: labelClient.name,
        pdfUrl: downloadUrl,
        labelName: labelClient.name,
      },
      {
        resendApiKey: emailCredentials.resendApiKey ?? '',
        resendFromEmail: emailCredentials.resendFromEmail ?? '',
        fetch: globalThis.fetch,
      },
    )
    emailResults.label = result.success ? { sent: true } : { sent: false, error: result.error }
    if (!result.success) warnings.push('label_email_failed')
  }

  return NextResponse.json(
    {
      invoice: toPortalInvoiceListItem(updatedInvoice),
      pdf_available: true,
      email: emailResults,
      warnings,
    },
    { status: 201 },
  )
})
