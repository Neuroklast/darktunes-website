/**
 * artist_private_data — staff/member-only secrets and PII.
 * Never query this table from public/anon code paths.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export type ArtistPrivateRow = {
  artist_id: string
  email: string | null
  vat_number: string | null
  notes: string | null
  bandsintown_api_key: string | null
  storage_quota_bytes: number | null
  is_eu_non_german: boolean
}

export type ArtistPrivateWrite = {
  email?: string | null
  vat_number?: string | null
  notes?: string | null
  bandsintown_api_key?: string | null
  storage_quota_bytes?: number | null
  is_eu_non_german?: boolean
}

export const ARTIST_PRIVATE_FIELD_KEYS = [
  'email',
  'vat_number',
  'notes',
  'bandsintown_api_key',
  'storage_quota_bytes',
  'is_eu_non_german',
] as const

type ArtistUpdate = Database['public']['Tables']['artists']['Update']

/**
 * Split an artists Update payload into public row fields + private table fields.
 * Secrets are always forced null on the public artists row when dual-writing.
 */
export function splitArtistUpdatePayload(payload: ArtistUpdate): {
  publicFields: ArtistUpdate
  privateFields: ArtistPrivateWrite
  hasPrivateFields: boolean
} {
  const publicFields: ArtistUpdate = { ...payload }
  const privateFields: ArtistPrivateWrite = {}
  let hasPrivateFields = false

  if ('email' in publicFields) {
    privateFields.email = publicFields.email ?? null
    publicFields.email = null
    hasPrivateFields = true
  }
  if ('vat_number' in publicFields) {
    privateFields.vat_number = publicFields.vat_number ?? null
    publicFields.vat_number = null
    hasPrivateFields = true
  }
  if ('notes' in publicFields) {
    privateFields.notes = publicFields.notes ?? null
    publicFields.notes = null
    hasPrivateFields = true
  }
  if ('bandsintown_api_key' in publicFields) {
    privateFields.bandsintown_api_key = publicFields.bandsintown_api_key ?? null
    publicFields.bandsintown_api_key = null
    hasPrivateFields = true
  }
  if ('storage_quota_bytes' in publicFields) {
    privateFields.storage_quota_bytes = publicFields.storage_quota_bytes ?? null
    // Keep storage_quota_bytes on artists for portal quota checks until fully migrated
    hasPrivateFields = true
  }
  if ('is_eu_non_german' in publicFields && publicFields.is_eu_non_german !== undefined) {
    privateFields.is_eu_non_german = publicFields.is_eu_non_german
    hasPrivateFields = true
  }

  return { publicFields, privateFields, hasPrivateFields }
}

function isMissingPrivateTable(error: { message: string; code?: string }): boolean {
  return (
    error.code === '42P01' ||
    error.message.includes('artist_private_data') ||
    error.message.includes('schema cache')
  )
}

export async function getArtistPrivateByArtistIds(
  db: DbClient,
  artistIds: string[],
): Promise<Map<string, ArtistPrivateRow>> {
  const map = new Map<string, ArtistPrivateRow>()
  if (artistIds.length === 0) return map

  const { data, error } = await db
    .from('artist_private_data')
    .select(
      'artist_id, email, vat_number, notes, bandsintown_api_key, storage_quota_bytes, is_eu_non_german',
    )
    .in('artist_id', artistIds)

  if (error) {
    if (isMissingPrivateTable(error)) return map
    throw new Error(error.message)
  }

  const rows = Array.isArray(data) ? data : data ? [data] : []
  for (const row of rows) {
    if (row && typeof row === 'object' && 'artist_id' in row && row.artist_id) {
      map.set(row.artist_id, row as ArtistPrivateRow)
    }
  }
  return map
}

export async function getArtistPrivateByArtistId(
  db: DbClient,
  artistId: string,
): Promise<ArtistPrivateRow | null> {
  const map = await getArtistPrivateByArtistIds(db, [artistId])
  return map.get(artistId) ?? null
}

export async function upsertArtistPrivateData(
  db: DbClient,
  artistId: string,
  fields: ArtistPrivateWrite,
): Promise<void> {
  if (Object.keys(fields).length === 0) return

  const payload = {
    artist_id: artistId,
    ...fields,
    updated_at: new Date().toISOString(),
  }

  const { error } = await db
    .from('artist_private_data')
    .upsert(payload, { onConflict: 'artist_id' })

  if (error) {
    if (isMissingPrivateTable(error)) return
    throw new Error(error.message)
  }
}
