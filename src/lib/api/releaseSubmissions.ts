import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ReleaseSubmission, SubmissionStatus } from '@/types'

type DbClient = SupabaseClient<Database>
type Row = Database['public']['Tables']['release_submissions']['Row']
type Insert = Database['public']['Tables']['release_submissions']['Insert']

function rowToSubmission(row: Row): ReleaseSubmission {
  return {
    id: row.id,
    artistId: row.artist_id,
    status: row.status,
    title: row.title,
    releaseDate: row.release_date,
    type: row.type,
    genre: row.genre,
    catalogNumber: row.catalog_number,
    isrc: row.isrc,
    labelCopy: row.label_copy,
    audioDownloadUrl: row.audio_download_url,
    coverArtUrl: row.cover_art_url,
    coverArtVerified: row.cover_art_verified,
    spotifyUrl: row.spotify_url,
    appleMusicUrl: row.apple_music_url,
    youtubeUrl: row.youtube_url,
    notes: row.notes,
    formData: row.form_data as Record<string, unknown> | null,
    adminReply: row.admin_reply,
    adminReplyAt: row.admin_reply_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getReleaseSubmissionsByArtistId(
  db: DbClient,
  artistId: string,
): Promise<ReleaseSubmission[]> {
  const { data, error } = await db
    .from('release_submissions')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToSubmission)
}

export async function getReleaseSubmissionById(
  db: DbClient,
  id: string,
): Promise<ReleaseSubmission | null> {
  const { data, error } = await db
    .from('release_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToSubmission(data) : null
}

export async function getAllReleaseSubmissions(db: DbClient): Promise<ReleaseSubmission[]> {
  const { data, error } = await db
    .from('release_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToSubmission)
}

export async function createReleaseSubmission(
  db: DbClient,
  payload: Insert,
): Promise<ReleaseSubmission> {
  const { data, error } = await db
    .from('release_submissions')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createReleaseSubmission')
  return rowToSubmission(data)
}

export async function updateReleaseSubmissionStatus(
  db: DbClient,
  id: string,
  status: SubmissionStatus,
  adminReply?: string,
): Promise<ReleaseSubmission> {
  const patch: Partial<Row> = {
    status,
    ...(adminReply !== undefined
      ? { admin_reply: adminReply, admin_reply_at: new Date().toISOString() }
      : {}),
  }
  const { data, error } = await db
    .from('release_submissions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateReleaseSubmissionStatus')
  return rowToSubmission(data)
}
