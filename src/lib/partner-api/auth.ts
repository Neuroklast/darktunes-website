import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ApiError } from '@/lib/errors'
import { PARTNER_API_KEY_PREFIX, hashPartnerApiKey } from './hash'

export { PARTNER_API_KEY_PREFIX, hashPartnerApiKey, generatePartnerApiKey } from './hash'

type DbClient = SupabaseClient<Database>

export function extractPartnerApiKey(authHeader: string | null): string | null {
  if (!authHeader) return null
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim()
  return authHeader.trim()
}

export interface PartnerApiAuthContext {
  organizationId: string
  apiKeyId: string
  scopes: string[]
}

export async function authenticatePartnerApiKey(
  db: DbClient,
  authHeader: string | null,
): Promise<PartnerApiAuthContext> {
  const rawKey = extractPartnerApiKey(authHeader)
  if (!rawKey?.startsWith(PARTNER_API_KEY_PREFIX)) {
    throw new ApiError(401, 'Invalid or missing API key', 'PARTNER_API_KEY_INVALID')
  }

  const keyHash = hashPartnerApiKey(rawKey)
  const { data, error } = await db
    .from('organization_api_keys')
    .select('id, organization_id, scopes, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  if (!data || data.revoked_at) {
    throw new ApiError(401, 'Invalid or revoked API key', 'PARTNER_API_KEY_INVALID')
  }

  void db
    .from('organization_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  return {
    organizationId: data.organization_id,
    apiKeyId: data.id,
    scopes: data.scopes ?? ['read'],
  }
}
