import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  listArtistInvoices,
  getArtistInvoice,
  getArtistInvoiceByStatementId,
  createArtistInvoice,
  createSosLinkedInvoice,
} from './artistInvoices'

type DbClient = SupabaseClient<Database>
type InvoiceRow = Database['public']['Tables']['artist_invoices']['Row']

const lineItems = [{ description: 'Royalties Q1-2024', qty: 1, unit_price_cents: 123456 }]

const mockInvoiceRow: InvoiceRow = {
  id: 'inv-uuid-1',
  artist_id: 'artist-uuid',
  invoice_number: 'INV-2024-001',
  artist_invoice_number: 'KS-2024-001',
  statement_id: null,
  client_name: 'darkTunes Music Group',
  client_email: 'info@dark-tunes.com',
  client_address: 'Friedhofweg 1, 69118 Heidelberg, Germany',
  line_items: lineItems,
  currency: 'EUR',
  tax_rate_pct: 19.0,
  status: 'draft',
  due_date: '2024-05-01',
  issued_date: '2024-04-01',
  notes: null,
  pdf_url: null,
  pdf_sha256: null,
  service_period_start: null,
  service_period_end: null,
  fx_rate: null,
  fx_rate_date: null,
  fx_rate_source: null,
  received_at: null,
  received_by: null,
  paid_at: null,
  paid_by: null,
  paid_amount_cents: 0,
  outstanding_amount_cents: null,
  payment_method: null,
  payment_reference: null,
  settlement_period_id: null,
  created_at: '2024-04-01T00:00:00Z',
  updated_at: '2024-04-01T00:00:00Z',
}

// Builder that supports range() for listArtistInvoices
function makeBuilder(
  data: unknown = null,
  error: unknown = null,
  count: number | null = null,
) {
  const result = { data, error, count }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(
  data: unknown = null,
  error: unknown = null,
  count: number | null = null,
): DbClient {
  return {
    from: vi.fn().mockReturnValue(makeBuilder(data, error, count)),
  } as unknown as DbClient
}

describe('listArtistInvoices', () => {
  it('returns mapped invoices with total count', async () => {
    const db = makeMockDb([mockInvoiceRow], null, 1)
    const result = await listArtistInvoices(db, 'artist-uuid')
    expect(result.invoices).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.invoices[0].invoiceNumber).toBe('INV-2024-001')
    expect(result.invoices[0].artistInvoiceNumber).toBe('KS-2024-001')
    expect(result.invoices[0].currency).toBe('EUR')
    expect(result.invoices[0].taxRatePct).toBe(19)
  })

  it('returns empty list when no invoices exist', async () => {
    const db = makeMockDb([], null, 0)
    const result = await listArtistInvoices(db, 'artist-uuid')
    expect(result.invoices).toEqual([])
    expect(result.total).toBe(0)
  })

  it('maps null optional fields to undefined/defaults', async () => {
    const rowWithNulls = {
      ...mockInvoiceRow,
      artist_invoice_number: null,
      statement_id: null,
      client_address: null,
      notes: null,
      pdf_url: null,
    } as unknown as InvoiceRow
    const db = makeMockDb([rowWithNulls], null, 1)
    const result = await listArtistInvoices(db, 'artist-uuid')
    const inv = result.invoices[0]
    expect(inv.artistInvoiceNumber).toBeUndefined()
    expect(inv.statementId).toBeUndefined()
    expect(inv.clientAddress).toBeUndefined()
    expect(inv.notes).toBeUndefined()
    expect(inv.pdfUrl).toBeUndefined()
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'list failed' })
    await expect(listArtistInvoices(db, 'artist-uuid')).rejects.toThrow('list failed')
  })
})

describe('getArtistInvoice', () => {
  it('returns the mapped invoice when found', async () => {
    const db = makeMockDb(mockInvoiceRow)
    const result = await getArtistInvoice(db, 'inv-uuid-1', 'artist-uuid')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('inv-uuid-1')
    expect(result!.artistId).toBe('artist-uuid')
    expect(result!.lineItems).toEqual(lineItems)
  })

  it('returns null when not found (PGRST116)', async () => {
    const db = makeMockDb(null, { code: 'PGRST116', message: 'not found' })
    const result = await getArtistInvoice(db, 'nonexistent', 'artist-uuid')
    expect(result).toBeNull()
  })

  it('throws on other database errors', async () => {
    const db = makeMockDb(null, { code: '42501', message: 'permission denied' })
    await expect(getArtistInvoice(db, 'inv-uuid-1', 'artist-uuid')).rejects.toThrow(
      'permission denied',
    )
  })
})

describe('getArtistInvoiceByStatementId', () => {
  it('returns invoice linked to the given statement', async () => {
    const sosRow: InvoiceRow = { ...mockInvoiceRow, statement_id: 'stmt-uuid-1' }
    const db = makeMockDb(sosRow)
    const result = await getArtistInvoiceByStatementId(db, 'artist-uuid', 'stmt-uuid-1')
    expect(result).not.toBeNull()
    expect(result!.statementId).toBe('stmt-uuid-1')
  })

  it('returns null when no invoice is linked (PGRST116)', async () => {
    const db = makeMockDb(null, { code: 'PGRST116', message: 'not found' })
    const result = await getArtistInvoiceByStatementId(db, 'artist-uuid', 'stmt-uuid-99')
    expect(result).toBeNull()
  })

  it('throws on other database errors', async () => {
    const db = makeMockDb(null, { code: 'XX000', message: 'internal error' })
    await expect(
      getArtistInvoiceByStatementId(db, 'artist-uuid', 'stmt-uuid-1'),
    ).rejects.toThrow('internal error')
  })
})

describe('createArtistInvoice', () => {
  it('inserts and returns the mapped invoice', async () => {
    const db = makeMockDb(mockInvoiceRow)
    const result = await createArtistInvoice(db, {
      artistId: 'artist-uuid',
      invoiceNumber: 'INV-2024-001',
      clientName: 'darkTunes Music Group',
      clientEmail: 'info@dark-tunes.com',
      lineItems,
      dueDate: '2024-05-01',
      issuedDate: '2024-04-01',
    })
    expect(result.id).toBe('inv-uuid-1')
    expect(result.invoiceNumber).toBe('INV-2024-001')
    expect(result.status).toBe('draft')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'insert failed' })
    await expect(
      createArtistInvoice(db, {
        artistId: 'artist-uuid',
        invoiceNumber: 'INV-ERR',
        clientName: 'Test',
        clientEmail: 'test@example.com',
        lineItems: [],
        dueDate: '2024-05-01',
        issuedDate: '2024-04-01',
      }),
    ).rejects.toThrow('insert failed')
  })
})

describe('createSosLinkedInvoice', () => {
  it('inserts a statement-linked invoice and returns mapped domain object', async () => {
    const sosRow: InvoiceRow = { ...mockInvoiceRow, statement_id: 'stmt-uuid-1' }
    const db = makeMockDb(sosRow)
    const result = await createSosLinkedInvoice(db, {
      artistId: 'artist-uuid',
      invoiceNumber: 'INV-2024-001',
      statementId: 'stmt-uuid-1',
      clientName: 'darkTunes Music Group',
      clientEmail: 'info@dark-tunes.com',
      lineItems,
      dueDate: '2024-05-01',
      issuedDate: '2024-04-01',
    })
    expect(result.statementId).toBe('stmt-uuid-1')
    expect(result.invoiceNumber).toBe('INV-2024-001')
  })

  it('includes artist invoice number when provided', async () => {
    const db = makeMockDb(mockInvoiceRow)
    const result = await createSosLinkedInvoice(db, {
      artistId: 'artist-uuid',
      invoiceNumber: 'INV-2024-001',
      artistInvoiceNumber: 'KS-2024-001',
      statementId: 'stmt-uuid-1',
      clientName: 'darkTunes Music Group',
      clientEmail: 'info@dark-tunes.com',
      lineItems,
      dueDate: '2024-05-01',
      issuedDate: '2024-04-01',
    })
    expect(result.artistInvoiceNumber).toBe('KS-2024-001')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'SOS insert failed' })
    await expect(
      createSosLinkedInvoice(db, {
        artistId: 'artist-uuid',
        invoiceNumber: 'INV-ERR',
        statementId: 'stmt-uuid-1',
        clientName: 'Test',
        clientEmail: 'test@example.com',
        lineItems: [],
        dueDate: '2024-05-01',
        issuedDate: '2024-04-01',
      }),
    ).rejects.toThrow('SOS insert failed')
  })
})
