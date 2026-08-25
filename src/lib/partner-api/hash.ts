/**
 * Pure Partner API key helpers — the key prefix, the sha256 hash used to look
 * up organization_api_keys.key_hash, and the key generator.
 *
 * Deliberately dependency-free (only node:crypto) so it can be imported from
 * Playwright E2E specs without dragging in @/lib/errors -> next/server, which
 * Node's ESM resolver can't follow under "type":"module" + Next 16 (no exports
 * map). src/lib/partner-api/auth.ts re-exports these for existing call sites.
 */
import { createHash } from 'node:crypto'

export const PARTNER_API_KEY_PREFIX = 'dt_live_'

export function hashPartnerApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex')
}

export function generatePartnerApiKey(): { rawKey: string; prefix: string; hash: string } {
  const bytes = createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 32)
  const rawKey = `${PARTNER_API_KEY_PREFIX}${bytes}`
  const prefix = rawKey.slice(0, 16)
  return { rawKey, prefix, hash: hashPartnerApiKey(rawKey) }
}
