import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PartnerListParams, PartnerListResult } from '@/lib/partner-api/listParams'

type DbClient = SupabaseClient<Database>

function applyCursor<T extends { lt: (col: string, val: string) => T }>(
  builder: T,
  cursor: string | undefined,
  column: string,
): T {
  return cursor ? builder.lt(column, cursor) : builder
}

export async function listPartnerArtists(
  db: DbClient,
  organizationId: string,
  params: PartnerListParams,
): Promise<PartnerListResult<Record<string, unknown>>> {
  let query = db
    .from('artists')
    .select('id, name, slug, genres, country, is_visible, created_at')
    .eq('organization_id', organizationId)

  query = applyCursor(query, params.cursor, 'created_at')
  query = query.order('created_at', { ascending: false }).limit(params.limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = data ?? []
  const last = rows.at(-1)
  return {
    data: rows,
    nextCursor: rows.length === params.limit && last ? String(last.created_at) : null,
  }
}

export async function getPartnerArtistById(
  db: DbClient,
  organizationId: string,
  artistId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('artists')
    .select('id, name, slug, genres, country, is_visible, created_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('id', artistId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function listPartnerReleases(
  db: DbClient,
  organizationId: string,
  params: PartnerListParams,
): Promise<PartnerListResult<Record<string, unknown>>> {
  let query = db
    .from('releases')
    .select('id, title, artist_id, release_date, type, catalog_number, isrc, featured, created_at')
    .eq('organization_id', organizationId)

  query = applyCursor(query, params.cursor, 'created_at')
  query = query.order('created_at', { ascending: false }).limit(params.limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = data ?? []
  const last = rows.at(-1)
  return {
    data: rows,
    nextCursor: rows.length === params.limit && last ? String(last.created_at) : null,
  }
}

export async function getPartnerReleaseById(
  db: DbClient,
  organizationId: string,
  releaseId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('releases')
    .select('id, title, artist_id, release_date, type, catalog_number, isrc, featured, created_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('id', releaseId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function listPartnerReleaseSubmissions(
  db: DbClient,
  organizationId: string,
  params: PartnerListParams,
): Promise<PartnerListResult<Record<string, unknown>>> {
  let query = db
    .from('release_submissions')
    .select(
      'id, artist_id, status, title, release_date, type, genre, isrc, catalog_number, created_at, updated_at',
    )
    .eq('organization_id', organizationId)

  query = applyCursor(query, params.cursor, 'created_at')
  query = query.order('created_at', { ascending: false }).limit(params.limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = data ?? []
  const last = rows.at(-1)
  return {
    data: rows,
    nextCursor: rows.length === params.limit && last ? String(last.created_at) : null,
  }
}

export async function getPartnerReleaseSubmissionById(
  db: DbClient,
  organizationId: string,
  submissionId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('release_submissions')
    .select(
      'id, artist_id, status, title, release_date, type, genre, isrc, catalog_number, audio_download_url, cover_art_url, notes, created_at, updated_at',
    )
    .eq('organization_id', organizationId)
    .eq('id', submissionId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}