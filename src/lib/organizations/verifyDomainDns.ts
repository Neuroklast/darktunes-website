/**
 * Custom-domain ownership proof via DNS TXT.
 * Expected TXT value is the full verification token (e.g. darktunes-verify=hex).
 * Checks both apex and `_darktunes-verify.<domain>` hostnames.
 */

import { promises as dns } from 'node:dns'

export type TxtResolver = (hostname: string) => Promise<string[][]>

export interface DomainDnsVerificationResult {
  ok: boolean
  checkedHosts: string[]
  matchedHost: string | null
  records: string[]
  error: string | null
}

function flattenTxtChunks(chunks: string[][]): string[] {
  return chunks.map((parts) => parts.join(''))
}

export function domainVerificationHostnames(domain: string): string[] {
  const normalized = domain.trim().toLowerCase().replace(/^www\./, '')
  return [normalized, `_darktunes-verify.${normalized}`]
}

export async function verifyDomainTxtToken(
  domain: string,
  expectedToken: string,
  resolveTxt: TxtResolver = (host) => dns.resolveTxt(host),
): Promise<DomainDnsVerificationResult> {
  const token = expectedToken.trim()
  const hosts = domainVerificationHostnames(domain)
  const allRecords: string[] = []
  let lastError: string | null = null

  for (const host of hosts) {
    try {
      const chunks = await resolveTxt(host)
      const flat = flattenTxtChunks(chunks)
      allRecords.push(...flat.map((r) => `${host}: ${r}`))
      const matched = flat.some((record) => record.includes(token))
      if (matched) {
        return {
          ok: true,
          checkedHosts: hosts,
          matchedHost: host,
          records: allRecords,
          error: null,
        }
      }
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : null
      const message = err instanceof Error ? err.message : String(err)
      // ENOTFOUND / ENODATA are normal until the customer publishes the record
      lastError = code ? `${code}: ${message}` : message
    }
  }

  return {
    ok: false,
    checkedHosts: hosts,
    matchedHost: null,
    records: allRecords,
    error: lastError,
  }
}
