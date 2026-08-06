import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Artist } from '@/types'
import { sanitizeArtistWrite } from '@/lib/sanitizeTextContent'
import { rowToArtist } from './artistRowMapper'
import {
  getArtistPrivateByArtistId,
  getArtistPrivateByArtistIds,
  splitArtistUpdatePayload,
  upsertArtistPrivateData,
} from './artistPrivateData'
import {
  getPublicArtists as getPublicArtistsSafe,
  getPublicRelatedArtists,
  type PublicArtist,
} from './publicArtist'

type DbClient = SupabaseClient<Database>
export type ArtistInsert = Database['public']['Tables']['artists']['Insert']
export type ArtistUpdate = Database['public']['Tables']['artists']['Update']

export { rowToArtist }
export type { PublicArtist }

/**
 * Returns up to `limit` visible artists that share at least one genre with
 * the given artist, excluding the current artist itself.
 * Public-safe columns only (no API keys / PII).
 */
export async function getRelatedArtists(
  db: DbClient,
  currentArtistId: string,
  genres: string[],
  limit = 6,
): Promise<PublicArtist[]> {
  return getPublicRelatedArtists(db, currentArtistId, genres, limit)
}

export async function getArtists(db: DbClient): Promise<Artist[]> {
  const { data, error } = await db
    .from('artists')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const privateMap = await getArtistPrivateByArtistIds(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((row) => rowToArtist(row, privateMap.get(row.id)))
}

/**
 * Public-facing query: visible artists, public columns only.
 * Never selects bandsintown_api_key, email, vat_number, notes, user_id, etc.
 */
export async function getPublicArtists(db: DbClient): Promise<PublicArtist[]> {
  return getPublicArtistsSafe(db)
}

export async function getArtistById(db: DbClient, id: string): Promise<Artist | null> {
  const { data, error } = await db.from('artists').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  if (!data) return null
  const privateRow = await getArtistPrivateByArtistId(db, id)
  return rowToArtist(data, privateRow)
}

export async function getArtistBySlug(db: DbClient, slug: string): Promise<Artist | null> {
  const { data, error } = await db.from('artists').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  if (data) {
    const privateRow = await getArtistPrivateByArtistId(db, data.id)
    return rowToArtist(data, privateRow)
  }

  const { data: nullSlugArtists, error: nullSlugError } = await db
    .from('artists')
    .select('*')
    .or('slug.is.null,slug.eq.')
  if (nullSlugError) throw new Error(nullSlugError.message)

  for (const row of nullSlugArtists ?? []) {
    const privateRow = await getArtistPrivateByArtistId(db, row.id)
    const mappedArtist = rowToArtist(row, privateRow)
    if (mappedArtist.slug === slug) return mappedArtist
  }
  return null
}

export async function createArtist(db: DbClient, artistData: ArtistInsert): Promise<Artist> {
  const sanitized = sanitizeArtistWrite(artistData)
  const { publicFields, privateFields, hasPrivateFields } = splitArtistUpdatePayload(sanitized)
  // Insert requires name/slug from original payload; private splitter only clears secrets.
  const insertRow = {
    ...sanitized,
    ...publicFields,
    name: sanitized.name,
    slug: sanitized.slug,
    email: null,
    vat_number: null,
    notes: null,
    bandsintown_api_key: null,
  } satisfies ArtistInsert
  const { data, error } = await db.from('artists').insert(insertRow).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createArtist')
  if (hasPrivateFields) {
    await upsertArtistPrivateData(db, data.id, privateFields)
  }
  const privateRow = await getArtistPrivateByArtistId(db, data.id)
  return rowToArtist(data, privateRow)
}

export async function updateArtist(
  db: DbClient,
  id: string,
  artistData: ArtistUpdate,
): Promise<Artist> {
  const sanitized = sanitizeArtistWrite(artistData)
  const { publicFields, privateFields, hasPrivateFields } = splitArtistUpdatePayload(sanitized)
  const { data, error } = await db
    .from('artists')
    .update(publicFields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateArtist')
  if (hasPrivateFields) {
    await upsertArtistPrivateData(db, id, privateFields)
  }
  const privateRow = await getArtistPrivateByArtistId(db, id)
  return rowToArtist(data, privateRow)
}

export async function deleteArtist(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('artists').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
