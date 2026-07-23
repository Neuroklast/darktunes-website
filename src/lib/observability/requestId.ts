/**
 * Request correlation IDs for API routes and logs.
 *
 * Prefer an incoming `x-request-id` when valid; otherwise mint a UUID.
 * Echo the same id on JSON error responses and response headers.
 */

export const REQUEST_ID_HEADER = 'x-request-id'

/** Client- or edge-supplied ids must be short opaque tokens (no spaces / PII). */
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/

export function isValidRequestId(value: string): boolean {
  return REQUEST_ID_RE.test(value)
}

export function createRequestId(): string {
  return crypto.randomUUID()
}

/**
 * Resolve correlation id from request headers or generate a new one.
 */
export function resolveRequestId(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER)?.trim()
  if (incoming && isValidRequestId(incoming)) return incoming
  return createRequestId()
}
