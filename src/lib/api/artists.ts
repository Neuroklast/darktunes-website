import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Artist } from '@/types'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { sanitizeArtistWrite } from '@/lib/sanitizeTextContent'
import { rowToArtist } from './artistRowMapper'
import { PUBLIC_QUERY_LIMITS } from './queryLimits'

type DbClient = SupabaseClient<Database>
export type ArtistInsert = Database['public']['Tables']['artists']['Insert']
export type ArtistUpdate = Database['public']['Tables']['artists']['Update']

export { rowToArtist }

/**
 * Returns up to `limit` visible artists that share at least one genre with
 * the given artist, excluding the current artist itself.
 *
 * Uses PostgREST's `ov` (array-overlap) filter which maps to the PostgreSQL
 * `&&` operator so only a single indexed query is needed.
 *
 * Returns an empty array when `genres` is empty or on any error.
 */
export async function getRelatedArtists(
  db: DbClient,
  currentArtistId: string,
  genres: string[],
  limit = 6,
): Promise<Artist[]> {
  if (!genres.length) return []
  const { data, error } = await db
    .from('artists')
    .select('*')
    .eq('is_visible', true)
    .neq('id', currentArtistId)
    .filter('genres', 'ov', `{${genres.join(',')}}`)
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToArtist)
}

export async function getArtists(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Artist[]> {
  const { data, error } = await db
    .from('artists')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToArtist)
}

/**
 * Public-facing query: returns only visible artists.
 * Used by the public homepage (Server Component). The admin uses getArtists instead.
 */
export async function getPublicArtists(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Artist[]> {
  const { data, error } = await db
    .from('artists')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_visible', true)
    .order('featured', { ascending: false })
    .order('name', { ascending: true })
    .limit(PUBLIC_QUERY_LIMITS.artists)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToArtist)
}

export async function getArtistById(db: DbClient, id: string): Promise<Artist | null> {
  const { data, error } = await db.from('artists').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data ? rowToArtist(data) : null
}

export async function getArtistBySlug(
  db: DbClient,
  slug: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Artist | null> {
  const { data, error } = await db
    .from('artists')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return rowToArtist(data)

  const { data: nullSlugArtists, error: nullSlugError } = await db
    .from('artists')
    .select('*')
    .or('slug.is.null,slug.eq.')
  if (nullSlugError) throw new Error(nullSlugError.message)

  for (const row of nullSlugArtists ?? []) {
    const mappedArtist = rowToArtist(row)
    if (mappedArtist.slug === slug) return mappedArtist
  }
  return null
}

export async function createArtist(db: DbClient, artistData: ArtistInsert): Promise<Artist> {
  const { data, error } = await db.from('artists').insert(sanitizeArtistWrite(artistData)).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createArtist')
  return rowToArtist(data)
}

export async function updateArtist(
  db: DbClient,
  id: string,
  artistData: ArtistUpdate,
): Promise<Artist> {
  const { data, error } = await db
    .from('artists')
    .update(sanitizeArtistWrite(artistData))
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateArtist')
  return rowToArtist(data)
}

export async function deleteArtist(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('artists').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
