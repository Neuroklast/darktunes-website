import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Release, ReleaseSubmission, SubmissionStatus } from '@/types'
import { createRelease, rowToRelease } from '@/lib/api/releases'

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
    progressNote: row.progress_note ?? null,
    releaseId: row.release_id ?? null,
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

/**
 * Atomic insert of submission + tracks via SECURITY DEFINER RPC
 * (public.create_release_submission_with_tracks). Call with service-role
 * after membership validation.
 */
export async function createReleaseSubmissionWithTracksAtomic(
  db: DbClient,
  submission: Insert,
  tracks: Array<
    Omit<Database['public']['Tables']['release_submission_tracks']['Insert'], 'submission_id'> & {
      submission_id?: string
    }
  >,
): Promise<ReleaseSubmission> {
  const pSubmission: Record<string, unknown> = {
    artist_id: submission.artist_id,
    title: submission.title,
    audio_download_url: submission.audio_download_url,
    cover_art_url: submission.cover_art_url,
    cover_art_verified: submission.cover_art_verified ?? false,
    release_date: submission.release_date ?? null,
    type: submission.type ?? null,
    genre: submission.genre ?? null,
    catalog_number: submission.catalog_number ?? null,
    isrc: submission.isrc ?? null,
    label_copy: submission.label_copy ?? null,
    spotify_url: submission.spotify_url ?? null,
    apple_music_url: submission.apple_music_url ?? null,
    youtube_url: submission.youtube_url ?? null,
    notes: submission.notes ?? null,
    form_data: submission.form_data ?? null,
  }

  const pTracks = tracks.map((t) => ({
    track_number: t.track_number,
    display_order: t.display_order,
    title: t.title ?? null,
    isrc: t.isrc ?? null,
    composer: t.composer ?? null,
    author: t.author ?? null,
    genre: t.genre ?? null,
    language: t.language ?? null,
    gema: t.gema ?? null,
    explicit: t.explicit ?? null,
    live: t.live ?? null,
    cover: t.cover ?? null,
    instrumental: t.instrumental ?? null,
    preview_start_seconds: t.preview_start_seconds ?? null,
    duration_seconds: t.duration_seconds ?? null,
    form_data: t.form_data ?? null,
  }))

  // RPC is defined in reset.sql; Database.Functions is still Record<string, never>
  // until a full type regen — call via untyped client surface.
  const { data: id, error } = await (db as unknown as {
    rpc: (
      fn: string,
      args: { p_submission: Record<string, unknown>; p_tracks: unknown },
    ) => Promise<{ data: string | null; error: { message: string } | null }>
  }).rpc('create_release_submission_with_tracks', {
    p_submission: pSubmission,
    p_tracks: pTracks,
  })
  if (error) throw new Error(error.message)
  if (!id || typeof id !== 'string') {
    throw new Error('No id returned from create_release_submission_with_tracks')
  }

  const created = await getReleaseSubmissionById(db, id)
  if (!created) throw new Error('Submission created but could not be reloaded')
  return created
}

export async function updateReleaseSubmissionStatus(
  db: DbClient,
  id: string,
  status: SubmissionStatus,
  adminReply?: string,
  progressNote?: string | null,
): Promise<ReleaseSubmission> {
  const patch: Partial<Row> = {
    status,
    ...(adminReply !== undefined
      ? { admin_reply: adminReply, admin_reply_at: new Date().toISOString() }
      : {}),
    ...(progressNote !== undefined ? { progress_note: progressNote } : {}),
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

/**
 * Creates a hidden catalog release from a submission and links them.
 * Idempotent: if submission already has release_id, returns that release.
 */
export async function createDraftReleaseFromSubmission(
  db: DbClient,
  submissionId: string,
): Promise<{ submission: ReleaseSubmission; release: Release; created: boolean }> {
  const submission = await getReleaseSubmissionById(db, submissionId)
  if (!submission) throw new Error('Submission not found')

  if (submission.releaseId) {
    const { data: existing, error } = await db
      .from('releases')
      .select('*')
      .eq('id', submission.releaseId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (existing) {
      return {
        submission,
        release: rowToRelease(existing),
        created: false,
      }
    }
  }

  const releaseType =
    submission.type === 'compilation' || !submission.type
      ? 'album'
      : submission.type

  const releaseDate =
    submission.releaseDate && /^\d{4}-\d{2}-\d{2}/.test(submission.releaseDate)
      ? submission.releaseDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)

  const release = await createRelease(db, {
    title: submission.title,
    artist_id: submission.artistId,
    release_date: releaseDate,
    type: releaseType,
    cover_art: submission.coverArtUrl || null,
    catalog_number: submission.catalogNumber,
    isrc: submission.isrc,
    spotify_url: submission.spotifyUrl,
    apple_music_url: submission.appleMusicUrl,
    youtube_url: submission.youtubeUrl,
    is_visible: false,
    featured: false,
    is_promo: false,
    promo_text: submission.labelCopy,
    sync_policy: 'manual_until_street',
  })

  const { error: junctionErr } = await db.from('release_artists' as const).insert({
    release_id: release.id,
    artist_id: submission.artistId,
    sort_order: 0,
  })
  if (
    junctionErr &&
    junctionErr.code !== '23505' &&
    !junctionErr.message.toLowerCase().includes('duplicate')
  ) {
    console.warn('[createDraftReleaseFromSubmission] release_artists:', junctionErr.message)
  }

  const { data: linked, error: linkErr } = await db
    .from('release_submissions')
    .update({ release_id: release.id })
    .eq('id', submissionId)
    .select()
    .single()
  if (linkErr) throw new Error(linkErr.message)
  if (!linked) throw new Error('Failed to link submission to release')

  return {
    submission: rowToSubmission(linked),
    release,
    created: true,
  }
}
