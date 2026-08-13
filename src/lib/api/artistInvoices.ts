import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { invoiceGrossCents } from '@/lib/api/settlementLedger'

type DbClient = SupabaseClient<Database>
type InvoiceRow = Database['public']['Tables']['artist_invoices']['Row']
type InvoiceStatus = InvoiceRow['status']

export interface InvoiceLineItem {
  description: string
  qty: number
  unit_price_cents: number
}

export interface ArtistInvoice {
  id: string
  artistId: string
  invoiceNumber: string
  artistInvoiceNumber: string | undefined
  statementId: string | undefined
  clientName: string
  clientEmail: string
  clientAddress: string | undefined
  lineItems: InvoiceLineItem[]
  currency: string
  taxRatePct: number
  status: InvoiceStatus
  dueDate: string
  issuedDate: string
  notes: string | undefined
  pdfUrl: string | undefined
  pdfSha256: string | undefined
  servicePeriodStart: string | undefined
  servicePeriodEnd: string | undefined
  fxRate: number | undefined
  fxRateDate: string | undefined
  fxRateSource: string | undefined
  receivedAt: string | undefined
  receivedBy: string | undefined
  paidAt: string | undefined
  paidBy: string | undefined
  paidAmountCents: number
  outstandingAmountCents: number | undefined
  paymentMethod: InvoiceRow['payment_method']
  paymentReference: string | undefined
  settlementPeriodId: string | undefined
  createdAt: string
  updatedAt: string
}

export interface CreateInvoiceData {
  artistId: string
  invoiceNumber: string
  artistInvoiceNumber?: string
  clientName: string
  clientEmail: string
  clientAddress?: string
  lineItems: InvoiceLineItem[]
  currency?: string
  taxRatePct?: number
  dueDate: string
  issuedDate: string
  notes?: string
}

export interface CreateSosLinkedInvoiceData extends CreateInvoiceData {
  statementId: string
  settlementPeriodId?: string | null
}

function rowToArtistInvoice(row: InvoiceRow): ArtistInvoice {
  return {
    id: row.id,
    artistId: row.artist_id,
    invoiceNumber: row.invoice_number,
    artistInvoiceNumber: row.artist_invoice_number ?? undefined,
    statementId: row.statement_id ?? undefined,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientAddress: row.client_address ?? undefined,
    lineItems: Array.isArray(row.line_items) ? row.line_items : [],
    currency: row.currency ?? 'EUR',
    taxRatePct: Number(row.tax_rate_pct ?? 19),
    status: row.status ?? 'draft',
    dueDate: row.due_date ?? '',
    issuedDate: row.issued_date ?? '',
    notes: row.notes ?? undefined,
    pdfUrl: row.pdf_url ?? undefined,
    pdfSha256: row.pdf_sha256 ?? undefined,
    servicePeriodStart: row.service_period_start ?? undefined,
    servicePeriodEnd: row.service_period_end ?? undefined,
    fxRate: row.fx_rate != null ? Number(row.fx_rate) : undefined,
    fxRateDate: row.fx_rate_date ?? undefined,
    fxRateSource: row.fx_rate_source ?? undefined,
    receivedAt: row.received_at ?? undefined,
    receivedBy: row.received_by ?? undefined,
    paidAt: row.paid_at ?? undefined,
    paidBy: row.paid_by ?? undefined,
    paidAmountCents: Number(row.paid_amount_cents ?? 0),
    outstandingAmountCents: row.outstanding_amount_cents ?? undefined,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference ?? undefined,
    settlementPeriodId: row.settlement_period_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normaliseOptional(value?: string): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function listArtistInvoices(
  supabase: DbClient,
  artistId: string,
  page = 1,
  pageSize = 20,
): Promise<{ invoices: ArtistInvoice[]; total: number }> {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from('artist_invoices')
    .select('*', { count: 'exact' })
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw new Error(`Failed to list invoices: ${error.message}`)
  return {
    invoices: (data ?? []).map(rowToArtistInvoice),
    total: count ?? 0,
  }
}

export async function getArtistInvoice(
  supabase: DbClient,
  id: string,
  artistId: string,
): Promise<ArtistInvoice | null> {
  const { data, error } = await supabase
    .from('artist_invoices')
    .select('*')
    .eq('id', id)
    .eq('artist_id', artistId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to get invoice: ${error.message}`)
  }

  return rowToArtistInvoice(data)
}

export async function getArtistInvoiceByStatementId(
  supabase: DbClient,
  artistId: string,
  statementId: string,
): Promise<ArtistInvoice | null> {
  const { data, error } = await supabase
    .from('artist_invoices')
    .select('*')
    .eq('artist_id', artistId)
    .eq('statement_id', statementId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Failed to get linked invoice: ${error.message}`)
  }

  return rowToArtistInvoice(data)
}

export async function createArtistInvoice(
  supabase: DbClient,
  data: CreateInvoiceData,
): Promise<ArtistInvoice> {
  const { data: row, error } = await supabase
    .from('artist_invoices')
    .insert({
      artist_id: data.artistId,
      invoice_number: data.invoiceNumber,
      artist_invoice_number: normaliseOptional(data.artistInvoiceNumber),
      client_name: data.clientName,
      client_email: data.clientEmail,
      client_address: normaliseOptional(data.clientAddress),
      line_items: data.lineItems,
      currency: data.currency ?? 'EUR',
      tax_rate_pct: data.taxRatePct ?? 19.0,
      due_date: data.dueDate,
      issued_date: data.issuedDate,
      notes: normaliseOptional(data.notes),
      status: 'draft',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create invoice: ${error.message}`)
  return rowToArtistInvoice(row)
}

export class DuplicateStatementInvoiceError extends Error {
  constructor() {
    super('An invoice for this statement already exists')
    this.name = 'DuplicateStatementInvoiceError'
  }
}

export async function createSosLinkedInvoice(
  supabase: DbClient,
  data: CreateSosLinkedInvoiceData,
): Promise<ArtistInvoice> {
  const { data: row, error } = await supabase
    .from('artist_invoices')
    .insert({
      artist_id: data.artistId,
      invoice_number: data.invoiceNumber,
      artist_invoice_number: normaliseOptional(data.artistInvoiceNumber),
      statement_id: data.statementId,
      settlement_period_id: data.settlementPeriodId ?? null,
      client_name: data.clientName,
      client_email: data.clientEmail,
      client_address: normaliseOptional(data.clientAddress),
      line_items: data.lineItems,
      currency: data.currency ?? 'EUR',
      tax_rate_pct: data.taxRatePct ?? 19.0,
      due_date: data.dueDate,
      issued_date: data.issuedDate,
      notes: normaliseOptional(data.notes),
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') throw new DuplicateStatementInvoiceError()
    throw new Error(`Failed to create linked invoice: ${error.message}`)
  }
  return rowToArtistInvoice(row)
}

export async function updateInvoice(
  supabase: DbClient,
  id: string,
  artistId: string,
  updates: Partial<{
    status: InvoiceStatus
    pdf_url: string
    pdf_sha256: string
    service_period_start: string | null
    service_period_end: string | null
    fx_rate: number | null
    fx_rate_date: string | null
    fx_rate_source: string | null
    notes: string | null
    artist_invoice_number: string | null
  }>,
): Promise<ArtistInvoice> {
  // GoBD write-once: never replace an issued PDF artifact.
  if (updates.pdf_url !== undefined || updates.pdf_sha256 !== undefined) {
    const existing = await getArtistInvoice(supabase, id, artistId)
    if (existing?.pdfUrl || existing?.pdfSha256) {
      throw new Error('Invoice PDF is immutable once issued')
    }
  }

  const { data: row, error } = await supabase
    .from('artist_invoices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('artist_id', artistId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update invoice: ${error.message}`)
  return rowToArtistInvoice(row)
}

export async function getAdminInvoiceById(db: DbClient, id: string): Promise<ArtistInvoice | null> {
  const { data, error } = await db.from('artist_invoices').select('*').eq('id', id).single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  return rowToArtistInvoice(data as InvoiceRow)
}

export async function listInvoicesForPeriod(
  db: DbClient,
  settlementPeriodId: string,
): Promise<ArtistInvoice[]> {
  const { data, error } = await db
    .from('artist_invoices')
    .select('*')
    .eq('settlement_period_id', settlementPeriodId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToArtistInvoice(row as InvoiceRow))
}

export async function listInvoicesByStatementIds(
  db: DbClient,
  statementIds: string[],
): Promise<ArtistInvoice[]> {
  if (statementIds.length === 0) return []

  const { data, error } = await db
    .from('artist_invoices')
    .select('*')
    .in('statement_id', statementIds)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => rowToArtistInvoice(row as InvoiceRow))
}

export async function markInvoiceReceived(
  db: DbClient,
  id: string,
  actorId: string,
): Promise<ArtistInvoice> {
  const existing = await getAdminInvoiceById(db, id)
  if (!existing) throw new Error('Invoice not found')
  if (!['sent', 'draft'].includes(existing.status)) {
    throw new Error(`Cannot mark received from status "${existing.status}"`)
  }

  const now = new Date().toISOString()
  const { data, error } = await db
    .from('artist_invoices')
    .update({
      status: 'received',
      received_at: now,
      received_by: actorId,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return rowToArtistInvoice(data as InvoiceRow)
}

export interface RecordInvoicePaymentInput {
  amountCents: number
  paymentMethod: NonNullable<InvoiceRow['payment_method']>
  paymentReference?: string
  actorId: string
}

export async function recordInvoicePayment(
  db: DbClient,
  id: string,
  input: RecordInvoicePaymentInput,
): Promise<ArtistInvoice> {
  const existing = await getAdminInvoiceById(db, id)
  if (!existing) throw new Error('Invoice not found')
  if (!['received', 'partially_paid', 'sent'].includes(existing.status)) {
    throw new Error(`Cannot record payment from status "${existing.status}"`)
  }

  // Cap against gross total (net + VAT) so payments match PDF totals.
  const totalCents = invoiceGrossCents(existing.lineItems, existing.taxRatePct)
  const newPaid = existing.paidAmountCents + input.amountCents
  if (newPaid > totalCents) throw new Error('Payment exceeds invoice total')

  const outstanding = totalCents - newPaid
  const now = new Date().toISOString()
  const nextStatus = outstanding === 0 ? 'paid' : 'partially_paid'

  const { data, error } = await db
    .from('artist_invoices')
    .update({
      status: nextStatus,
      paid_amount_cents: newPaid,
      outstanding_amount_cents: outstanding,
      paid_at: outstanding === 0 ? now : existing.paidAt ?? null,
      paid_by: input.actorId,
      payment_method: input.paymentMethod,
      payment_reference: input.paymentReference?.trim() || null,
      received_at: existing.receivedAt ?? now,
      received_by: existing.receivedBy ?? input.actorId,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return rowToArtistInvoice(data as InvoiceRow)
}
