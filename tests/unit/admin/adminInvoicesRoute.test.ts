import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyAdmin = vi.fn()
const listAdminInvoices = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  extractBearerToken: (header: string | null) =>
    header ? header.replace(/^Bearer\s+/i, '') : null,
  verifyAdmin: (...args: unknown[]) => verifyAdmin(...args),
}))

vi.mock('@/lib/api/artistInvoices', () => ({
  ADMIN_INVOICE_PAGE_SIZE_DEFAULT: 50,
  ADMIN_INVOICE_PAGE_SIZE_MAX: 200,
  listAdminInvoices: (...args: unknown[]) => listAdminInvoices(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ kind: 'server' })),
}))

const ARTIST_ID = '11111111-1111-4111-8111-111111111111'

describe('GET /api/admin/invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyAdmin.mockResolvedValue('admin-1')
    listAdminInvoices.mockResolvedValue({
      invoices: [
        {
          id: 'inv-1',
          artistId: ARTIST_ID,
          artistName: 'Frozen Plasma',
          invoiceNumber: 'DT-2026-0001',
          artistInvoiceNumber: 'SOS-2026-01',
          lineItems: [],
          currency: 'EUR',
          taxRatePct: 19,
          status: 'sent',
          issuedDate: '2026-02-01',
          dueDate: '2026-03-01',
          pdfUrl: 'https://cdn.test/invoices/artist-1/inv-1.pdf',
          pdfSha256: 'abc',
          paidAmountCents: 0,
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 2,
      pageSize: 50,
    })
  })

  it('strips the public pdf_url and forwards the filters', async () => {
    const { GET } = await import('../../../app/api/admin/invoices/route')
    const req = new NextRequest(
      `http://localhost/api/admin/invoices?artist_id=${ARTIST_ID}&status=sent&page=2&page_size=50`,
      { headers: { Authorization: 'Bearer token' } },
    )
    const res = await GET(req)
    const payload = await res.json()

    expect(res.status, JSON.stringify(payload)).toBe(200)
    expect(payload.items[0].pdfUrl).toBeUndefined()
    expect(payload.items[0].pdfSha256).toBeUndefined()
    expect(payload.items[0].hasPdf).toBe(true)
    expect(payload.items[0].artistName).toBe('Frozen Plasma')
    expect(payload.page_size).toBe(50)
    expect(listAdminInvoices).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ artistId: ARTIST_ID, status: 'sent', page: 2, pageSize: 50 }),
    )
  })

  it('rejects unknown status filters with 400', async () => {
    const { GET } = await import('../../../app/api/admin/invoices/route')
    const req = new NextRequest('http://localhost/api/admin/invoices?status=bogus', {
      headers: { Authorization: 'Bearer token' },
    })
    const res = await GET(req)

    expect(res.status).toBe(400)
    expect(listAdminInvoices).not.toHaveBeenCalled()
  })
})
