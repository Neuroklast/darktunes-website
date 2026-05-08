import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Artist } from '@/types'

type DbClient = SupabaseClient<Database>
type ArtistRow = Database['public']['Tables']['artists']['Row']
export type ArtistInsert = Database['public']['Tables']['artists']['Insert']
export type ArtistUpdate = Database['public']['Tables']['artists']['Update']

function rowToArtist(row: ArtistRow): Artist {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    bio: row.bio ?? '',
    genres: row.genres,
    imageUrl: row.image_url ?? '',
    spotifyUrl: row.spotify_url ?? undefined,
    instagramUrl: row.instagram_url ?? undefined,
    youtubeUrl: row.youtube_url ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    featured: row.featured,
    country: row.country ?? undefined,
    email: row.email ?? undefined,
    vatNumber: row.vat_number ?? undefined,
    isEuNonGerman: row.is_eu_non_german,
    notes: row.notes ?? undefined,
    spotifyId: row.spotify_id ?? undefined,
    discogsId: row.discogs_id ?? undefined,
    songkickId: row.songkick_id ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
  }
}

export async function getArtists(db: DbClient): Promise<Artist[]> {
  const { data, error } = await db
    .from('artists')
    .select('*')
    .order('name', { ascending: true })
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

export async function createArtist(db: DbClient, artistData: ArtistInsert): Promise<Artist> {
  const { data, error } = await db.from('artists').insert(artistData).select().single()
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
    .update(artistData)
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
