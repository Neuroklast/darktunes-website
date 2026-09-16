import { describe, expect, it } from 'vitest'
import { mintInvoicePdfToken, verifyInvoicePdfToken } from './invoicePdfToken'

const SECRET = 'a'.repeat(64)
const INVOICE_ID = '5f0c2f0e-2f7b-4a4a-9d3a-1a2b3c4d5e6f'

describe('invoicePdfToken', () => {
  it('mints a token that verifies for the same invoice and secret', () => {
    const token = mintInvoicePdfToken(SECRET, INVOICE_ID, 1_000)
    const result = verifyInvoicePdfToken(SECRET, token, 2_000)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.invoiceId).toBe(INVOICE_ID)
    }
  })

  it('rejects a token signed with a different secret', () => {
    const token = mintInvoicePdfToken(SECRET, INVOICE_ID, 1_000)
    const result = verifyInvoicePdfToken('b'.repeat(64), token, 2_000)
    expect(result).toEqual({ ok: false, reason: 'bad_sig' })
  })

  it('rejects expired tokens', () => {
    const token = mintInvoicePdfToken(SECRET, INVOICE_ID, 1_000, 500)
    const result = verifyInvoicePdfToken(SECRET, token, 2_000)
    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects tampered payloads', () => {
    const token = mintInvoicePdfToken(SECRET, INVOICE_ID, 1_000)
    const [version, , sig] = token.split('.')
    const otherBody = Buffer.from(
      JSON.stringify({ invoice_id: '00000000-0000-0000-0000-000000000000', exp: 9_999_999_999_999 }),
    ).toString('base64url')
    const result = verifyInvoicePdfToken(SECRET, `${version}.${otherBody}.${sig}`, 2_000)
    expect(result).toEqual({ ok: false, reason: 'bad_sig' })
  })

  it('rejects malformed tokens', () => {
    expect(verifyInvoicePdfToken(SECRET, 'nonsense')).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyInvoicePdfToken(SECRET, 'v2.a.b')).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })
})
