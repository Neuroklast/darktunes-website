import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getBillingProfile = vi.fn()
const isBillingProfileComplete = vi.fn()
const getSiteSettings = vi.fn()
const getRulesPresetByName = vi.fn()
const createArtistInvoice = vi.fn()
const createSosLinkedInvoice = vi.fn()
const getArtistInvoiceByStatementId = vi.fn()
const updateInvoice = vi.fn()
const listArtistInvoices = vi.fn()
const appendLedgerEntry = vi.fn()
const hasLedgerEntry = vi.fn()
const getSalesStatementById = vi.fn()
const updateSalesStatementStatus = vi.fn()
const sendInvoiceEmail = vi.fn()
const emitNotification = vi.fn()
const generateInvoiceNumber = vi.fn()
const generateInvoicePdf = vi.fn()
const getEmailCredentials = vi.fn()
const r2Send = vi.fn()

class DuplicateStatementInvoiceError extends Error {
  constructor() {
    super('An invoice for this statement already exists')
    this.name = 'DuplicateStatementInvoiceError'
  }
}

class SettlementPeriodNotWritableError extends Error {
  constructor(message = 'Settlement period is not writable') {
    super(message)
    this.name = 'SettlementPeriodNotWritableError'
  }
}

vi.mock('@/lib/api/artistBillingProfiles', () => ({
  getBillingProfile: (...args: unknown[]) => getBillingProfile(...args),
  isBillingProfileComplete: (...args: unknown[]) => isBillingProfileComplete(...args),
}))

vi.mock('@/lib/api/siteSettings', () => ({
  getSiteSettings: (...args: unknown[]) => getSiteSettings(...args),
}))

vi.mock('@/lib/api/sosRulesPresets', () => ({
  getRulesPresetByName: (...args: unknown[]) => getRulesPresetByName(...args),
}))

vi.mock('@/lib/api/artistInvoices', () => ({
  createArtistInvoice: (...args: unknown[]) => createArtistInvoice(...args),
  createSosLinkedInvoice: (...args: unknown[]) => createSosLinkedInvoice(...args),
  getArtistInvoiceByStatementId: (...args: unknown[]) => getArtistInvoiceByStatementId(...args),
  listArtistInvoices: (...args: unknown[]) => listArtistInvoices(...args),
  updateInvoice: (...args: unknown[]) => updateInvoice(...args),
  DuplicateStatementInvoiceError,
}))

vi.mock('@/lib/api/settlementLedger', () => ({
  appendLedgerEntry: (...args: unknown[]) => appendLedgerEntry(...args),
  hasLedgerEntry: (...args: unknown[]) => hasLedgerEntry(...args),
}))

vi.mock('@/lib/api/settlementPeriods', () => ({
  assertSettlementPeriodWritableById: vi.fn(),
  getOrCreateSettlementPeriod: vi.fn(),
  SettlementPeriodNotWritableError,
}))

vi.mock('@/lib/api/salesStatements', () => ({
  getSalesStatementById: (...args: unknown[]) => getSalesStatementById(...args),
  updateSalesStatementStatus: (...args: unknown[]) => updateSalesStatementStatus(...args),
}))

vi.mock('@/lib/email/sendInvoiceEmail', () => ({
  sendInvoiceEmail: (...args: unknown[]) => sendInvoiceEmail(...args),
}))

vi.mock('@/lib/notifications/emit', () => ({
  emitNotification: (...args: unknown[]) => emitNotification(...args),
}))

vi.mock('@/lib/portal/invoiceNumber', () => ({
  generateInvoiceNumber: (...args: unknown[]) => generateInvoiceNumber(...args),
}))

vi.mock('@/lib/portal/invoicePdf', () => ({
  generateInvoicePdf: (...args: unknown[]) => generateInvoicePdf(...args),
}))

vi.mock('@/lib/secrets/getExternalCredentials', () => ({
  getEmailCredentials: (...args: unknown[]) => getEmailCredentials(...args),
}))

vi.mock('@/lib/r2Utils', () => ({
  createR2Client: () => ({ send: r2Send }),
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    CLOUDFLARE_R2_ACCOUNT_ID: 'account',
    CLOUDFLARE_R2_ACCESS_KEY_ID: 'key',
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret',
    CLOUDFLARE_R2_BUCKET_NAME: 'bucket',
    CLOUDFLARE_R2_PUBLIC_URL: 'https://cdn.test',
    API_CREDENTIALS_ENCRYPTION_KEY: 'a'.repeat(64),
  },
}))

vi.mock('@/lib/portal/withPortalMembership', () => ({
  withPortalMembershipWrite: vi.fn(async () => ({
    artist: { id: '11111111-1111-4111-8111-111111111111', name: 'Frozen Plasma' },
    serviceDb: { kind: 'service' },
  })),
  portalMemberWrite: vi.fn(
    async (
      _ctx: unknown,
      _meta: unknown,
      fn: (db: unknown) => Promise<unknown>,
    ) => ({ value: await fn({ kind: 'db' }) }),
  ),
}))

const ARTIST_ID = '11111111-1111-4111-8111-111111111111'
const STATEMENT_ID = '22222222-2222-4222-8222-222222222222'
const PERIOD_ID = '33333333-3333-4333-8333-333333333333'
const INVOICE_ID = '44444444-4444-4444-8444-444444444444'

function baseInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    artistId: ARTIST_ID,
    invoiceNumber: 'DT-2026-0001',
    artistInvoiceNumber: 'SOS-2026-01',
    statementId: STATEMENT_ID,
    clientName: 'darkTunes',
    clientEmail: 'finance@label.test',
    clientAddress: 'Street 1, Berlin',
    lineItems: [{ description: 'Service', qty: 1, unit_price_cents: 10_000 }],
    currency: 'EUR',
    taxRatePct: 19,
    status: 'draft',
    dueDate: '2026-03-01',
    issuedDate: '2026-02-01',
    paidAmountCents: 0,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  }
}

function statement(overrides: Record<string, unknown> = {}) {
  return {
    id: STATEMENT_ID,
    artist_id: ARTIST_ID,
    status: 'viewed',
    amountEur: 100,
    period: 'Q1-2026',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    settlementPeriodId: PERIOD_ID,
    ...overrides,
  }
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const statementBody = {
  artist_id: ARTIST_ID,
  artist_invoice_number: 'SOS-2026-01',
  client_name: 'darkTunes',
  client_email: 'placeholder@label.test',
  statement_id: STATEMENT_ID,
  line_items: [{ description: 'Service', qty: 1, unit_price_cents: 10_000 }],
  currency: 'EUR',
  tax_rate_pct: 19,
  due_date: '2026-03-01',
  send_email: true,
  send_to_label: true,
}

describe('POST /api/portal/invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBillingProfile.mockResolvedValue({ taxStatus: 'standard' })
    isBillingProfileComplete.mockReturnValue(true)
    getSiteSettings.mockResolvedValue({
      impressumCompanyName: 'darkTunes',
      impressumEmail: 'impressum@label.test',
      contactEmail: 'contact@label.test',
      labelBillingStreet: 'Street 1',
      labelBillingPostalCode: '10115',
      labelBillingCity: 'Berlin',
      labelBillingCountry: 'Germany',
    })
    getRulesPresetByName.mockResolvedValue({
      id: 'preset-1',
      name: 'Default',
      config: { appDefaults: { financeEmail: 'finance@label.test' } },
      createdAt: '',
      updatedAt: '',
    })
    getSalesStatementById.mockResolvedValue(statement())
    getArtistInvoiceByStatementId.mockResolvedValue(null)
    generateInvoiceNumber.mockResolvedValue('DT-2026-0001')
    generateInvoicePdf.mockResolvedValue(Buffer.from('%PDF-1.4'))
    r2Send.mockResolvedValue({})
    getEmailCredentials.mockResolvedValue({
      resendApiKey: 'resend-key',
      resendFromEmail: 'from@label.test',
    })
    createSosLinkedInvoice.mockResolvedValue(baseInvoice())
    createArtistInvoice.mockResolvedValue(baseInvoice({ statementId: undefined }))
    updateInvoice.mockImplementation(async (_db, _id, _artistId, updates) =>
      baseInvoice({
        ...updates,
        status: updates.status ?? 'draft',
        pdfUrl: 'https://cdn.test/invoices/artist/inv.pdf',
      }),
    )
    appendLedgerEntry.mockResolvedValue({})
    hasLedgerEntry.mockResolvedValue(false)
    updateSalesStatementStatus.mockResolvedValue(undefined)
    sendInvoiceEmail.mockResolvedValue({ success: true })
    emitNotification.mockResolvedValue({ inserted: 1, userIds: ['admin-1'], skippedByPreference: 0 })
  })

  it('mails the finance address, warns on mail failure and notifies staff', async () => {
    sendInvoiceEmail.mockResolvedValue({ success: false, error: 'HTTP 401' })

    const { POST } = await import('../../../app/api/portal/invoices/route')
    const res = await POST(makeRequest(statementBody))
    const payload = await res.json()

    expect(res.status, JSON.stringify(payload)).toBe(201)
    expect(payload.warnings).toContain('client_email_failed')
    expect(payload.email.client).toEqual({ sent: false, error: 'HTTP 401' })

    // financeEmail wins over the Impressum address for SOS-linked invoices.
    const firstCall = sendInvoiceEmail.mock.calls[0]
    expect(firstCall[0].clientEmail).toBe('finance@label.test')
    expect(firstCall[0].pdfUrl).toContain(`/api/invoices/${INVOICE_ID}/pdf?token=`)
    expect(firstCall[0].pdfUrl).not.toContain('cdn.test')

    expect(emitNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'invoice_submitted',
        entityId: INVOICE_ID,
        artistId: ARTIST_ID,
      }),
    )
    expect(payload.invoice.pdfUrl).toBeUndefined()
    expect(payload.invoice.hasPdf).toBe(true)
    expect(payload.pdf_available).toBe(true)
  })

  it('returns the existing invoice for a statement replay instead of 409', async () => {
    getArtistInvoiceByStatementId.mockResolvedValue(
      baseInvoice({ pdfUrl: 'https://cdn.test/invoices/artist/inv.pdf' }),
    )

    const { POST } = await import('../../../app/api/portal/invoices/route')
    const res = await POST(makeRequest(statementBody))
    const payload = await res.json()

    expect(res.status, JSON.stringify(payload)).toBe(200)
    expect(payload.warnings).toEqual(['already_exists'])
    expect(payload.invoice.pdfUrl).toBeUndefined()
    expect(payload.invoice.hasPdf).toBe(true)
    expect(createSosLinkedInvoice).not.toHaveBeenCalled()
    expect(sendInvoiceEmail).not.toHaveBeenCalled()
    // Replay repairs follow-up steps that failed after the PDF was attached.
    expect(hasLedgerEntry).toHaveBeenCalled()
    expect(appendLedgerEntry).toHaveBeenCalled()
    expect(emitNotification).toHaveBeenCalled()
  })

  it('replays an already-invoiced statement instead of failing the status gate', async () => {
    // A successful create advances the statement to "invoiced" — retries must
    // still return the existing invoice (200), not a 422.
    getSalesStatementById.mockResolvedValue(statement({ status: 'invoiced' }))
    getArtistInvoiceByStatementId.mockResolvedValue(
      baseInvoice({ pdfUrl: 'https://cdn.test/invoices/artist/inv.pdf', status: 'sent' }),
    )

    const { POST } = await import('../../../app/api/portal/invoices/route')
    const res = await POST(makeRequest(statementBody))
    const payload = await res.json()

    expect(res.status, JSON.stringify(payload)).toBe(200)
    expect(payload.warnings).toContain('already_exists')
    expect(createSosLinkedInvoice).not.toHaveBeenCalled()
  })

  it('keeps the invoice when a follow-up ledger step fails', async () => {
    appendLedgerEntry.mockRejectedValue(new Error('ledger down'))

    const { POST } = await import('../../../app/api/portal/invoices/route')
    const res = await POST(makeRequest(statementBody))
    const payload = await res.json()

    expect(res.status, JSON.stringify(payload)).toBe(201)
    expect(payload.warnings).toContain('ledger_entry_failed')
    expect(payload.invoice).toBeTruthy()
  })

  it('sends free invoices to the form client and the label copy to financeEmail', async () => {
    const { POST } = await import('../../../app/api/portal/invoices/route')
    const res = await POST(
      makeRequest({
        ...statementBody,
        statement_id: undefined,
        client_name: 'Customer GmbH',
        client_email: 'customer@example.com',
      }),
    )
    const payload = await res.json()

    expect(res.status, JSON.stringify(payload)).toBe(201)
    expect(createArtistInvoice).toHaveBeenCalled()
    expect(sendInvoiceEmail).toHaveBeenCalledTimes(2)
    expect(sendInvoiceEmail.mock.calls[0][0].clientEmail).toBe('customer@example.com')
    expect(sendInvoiceEmail.mock.calls[1][0].clientEmail).toBe('finance@label.test')
    expect(payload.warnings).toEqual([])
  })
})
