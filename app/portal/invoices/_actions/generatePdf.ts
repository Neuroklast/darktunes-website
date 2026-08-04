'use server'

import { z } from 'zod'
import type { BillingParty } from '@/lib/portal/invoicePdf'
import { generateInvoicePdf } from '@/lib/portal/invoicePdf'

const lineItemSchema = z.object({
  description: z.string().min(1).max(500),
  qty: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
})

const billingPartySchema = z.object({
  name: z.string().min(1).max(500),
  street: z.string().min(1).max(500),
  postalCode: z.string().min(1).max(20),
  city: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
  taxNumber: z.string().max(50).optional(),
  vatId: z.string().max(50).optional(),
  email: z.string().email().max(200).optional(),
})

const generatePdfSchema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sender: billingPartySchema,
  recipient: billingPartySchema,
  lineItems: z.array(lineItemSchema).min(1),
  currency: z.string().length(3).default('EUR'),
  taxRatePct: z.number().min(0).max(100).default(19),
  isSmallBusiness: z.boolean().default(false),
  taxStatus: z.enum(['standard', 'small_business', 'reverse_charge']).optional(),
  notes: z.string().max(4000).optional(),
})

export type GeneratePdfInput = z.infer<typeof generatePdfSchema>

export interface GeneratePdfResult {
  base64: string
  filename: string
  error?: never
}

export interface GeneratePdfError {
  base64?: never
  filename?: never
  error: string
}

export async function generateFreePdf(
  input: GeneratePdfInput,
): Promise<GeneratePdfResult | GeneratePdfError> {
  const parsed = generatePdfSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join('; ') }
  }

  const data = parsed.data
  const sender: BillingParty = {
    name: data.sender.name,
    street: data.sender.street,
    postalCode: data.sender.postalCode,
    city: data.sender.city,
    country: data.sender.country,
    taxNumber: data.sender.taxNumber,
    vatId: data.sender.vatId,
    email: data.sender.email,
  }

  const recipient: BillingParty = {
    name: data.recipient.name,
    street: data.recipient.street,
    postalCode: data.recipient.postalCode,
    city: data.recipient.city,
    country: data.recipient.country,
    taxNumber: data.recipient.taxNumber,
    vatId: data.recipient.vatId,
    email: data.recipient.email,
  }

  try {
    const taxStatus =
      data.taxStatus ?? (data.isSmallBusiness ? 'small_business' : 'standard')
    const pdfBytes = await generateInvoicePdf({
      invoiceNumber: data.invoiceNumber,
      issuedDate: data.issuedDate,
      dueDate: data.dueDate,
      artist: sender,
      label: recipient,
      labelDisplayName: recipient.name,
      lineItems: data.lineItems,
      currency: data.currency,
      taxRatePct: taxStatus === 'standard' ? data.taxRatePct : 0,
      taxStatus,
      isSmallBusiness: taxStatus === 'small_business',
      notes: data.notes,
    })

    const base64 = Buffer.from(pdfBytes).toString('base64')
    const filename = `rechnung-${data.invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf`
    return { base64, filename }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF generation failed'
    return { error: message }
  }
}
