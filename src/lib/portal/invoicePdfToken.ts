/**
 * src/lib/portal/invoicePdfToken.ts
 *
 * Signed, expiring access tokens for invoice PDF downloads.
 *
 * Invoice emails are sent to external bookkeepers/clients who have no portal
 * account, so the download link cannot require session auth. Instead of a
 * world-readable R2 public URL we mint an HMAC-signed token that the public
 * download route verifies before streaming the PDF.
 */

import { createHmac, timingSafeEqual } from 'crypto'

const VERSION = 'v1'
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface InvoicePdfTokenPayload {
  invoice_id: string
  exp: number
}

/** Domain-separated signing key — never use the raw master secret directly. */
function signingSecret(secret: string): string {
  return createHmac('sha256', secret).update('invoice-pdf-token-v1').digest('hex')
}

function signPayload(secret: string, body: string): string {
  return createHmac('sha256', signingSecret(secret)).update(body).digest('base64url')
}

export function mintInvoicePdfToken(
  secret: string,
  invoiceId: string,
  nowMs = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
): string {
  const payload: InvoicePdfTokenPayload = {
    invoice_id: invoiceId,
    exp: nowMs + ttlMs,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = signPayload(secret, body)
  return `${VERSION}.${body}.${sig}`
}

export type InvoicePdfTokenVerifyResult =
  | { ok: true; invoiceId: string; exp: number }
  | { ok: false; reason: 'malformed' | 'bad_sig' | 'expired' }

export function verifyInvoicePdfToken(
  secret: string,
  token: string,
  nowMs = Date.now(),
): InvoicePdfTokenVerifyResult {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) {
    return { ok: false, reason: 'malformed' }
  }
  const [, body, sig] = parts
  if (!body || !sig) return { ok: false, reason: 'malformed' }

  const expected = signPayload(secret, body)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'bad_sig' }
    }
  } catch {
    return { ok: false, reason: 'bad_sig' }
  }

  let payload: InvoicePdfTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as InvoicePdfTokenPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof payload.exp !== 'number' || payload.exp < nowMs) {
    return { ok: false, reason: 'expired' }
  }
  if (typeof payload.invoice_id !== 'string' || payload.invoice_id.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  return { ok: true, invoiceId: payload.invoice_id, exp: payload.exp }
}
