import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { JournalistDownload } from '@/types'

type DbClient = SupabaseClient<Database>
type DownloadRow = Database['public']['Tables']['journalist_downloads']['Row']
type DownloadInsert = Database['public']['Tables']['journalist_downloads']['Insert']

function rowToDownload(row: DownloadRow): JournalistDownload {
  return {
    id: row.id,
    journalistId: row.journalist_id,
    releaseId: row.release_id,
    assetId: row.asset_id ?? undefined,
    artistId: row.artist_id ?? null,
    assetKey: row.asset_key,
    downloadedAt: row.downloaded_at,
  }
}

export async function logDownload(
  db: DbClient,
  data: DownloadInsert,
): Promise<JournalistDownload> {
  const { data: row, error } = await db
    .from('journalist_downloads')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('No data returned from logDownload')
  return rowToDownload(row)
}

export async function getDownloadHistory(
  db: DbClient,
  journalistId: string,
): Promise<JournalistDownload[]> {
  const { data, error } = await db
    .from('journalist_downloads')
    .select('*')
    .eq('journalist_id', journalistId)
    .order('downloaded_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToDownload)
}
