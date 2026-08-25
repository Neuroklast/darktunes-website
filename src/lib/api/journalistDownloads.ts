import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { JournalistDownload } from '@/types'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type DownloadRow = Database['public']['Tables']['journalist_downloads']['Row']
type DownloadInsert = Database['public']['Tables']['journalist_downloads']['Insert']

function rowToDownload(row: DownloadRow): JournalistDownload {
  return {
    id: row.id,
    journalistId: row.journalist_id,
    releaseId: row.release_id,
    assetId: row.asset_id ?? undefined,
    assetKey: row.asset_key,
    downloadedAt: row.downloaded_at,
  }
}

export async function logDownload(
  db: DbClient,
  data: DownloadInsert,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<JournalistDownload> {
  const payload: DownloadInsert = {
    ...data,
    organization_id: data.organization_id ?? organizationId,
  }
  const { data: row, error } = await db
    .from('journalist_downloads')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('No data returned from logDownload')
  return rowToDownload(row)
}

export async function getDownloadHistory(
  db: DbClient,
  journalistId: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<JournalistDownload[]> {
  const { data, error } = await db
    .from('journalist_downloads')
    .select('*')
    .eq('journalist_id', journalistId)
    .eq('organization_id', organizationId)
    .order('downloaded_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToDownload)
}

export interface ArtistPressDownloadStats {
  totalDownloads: number
  last30Days: number
  uniqueJournalists: number
  recentDownloads: JournalistDownload[]
}

async function collectArtistAssetAndReleaseIds(
  db: DbClient,
  artistId: string,
): Promise<{ releaseIds: string[]; assetIds: string[] }> {
  const [releaseRows, directAssets, linkedAssets] = await Promise.all([
    db.from('release_artists').select('release_id').eq('artist_id', artistId),
    db.from('assets').select('id').eq('artist_id', artistId),
    db.from('asset_artists').select('asset_id').eq('artist_id', artistId),
  ])

  if (releaseRows.error) throw new Error(releaseRows.error.message)
  if (directAssets.error) throw new Error(directAssets.error.message)
  if (linkedAssets.error) throw new Error(linkedAssets.error.message)

  const releaseIds = (releaseRows.data ?? []).map((r) => r.release_id)
  const assetIds = [
    ...new Set([
      ...(directAssets.data ?? []).map((a) => a.id),
      ...(linkedAssets.data ?? []).map((a) => a.asset_id),
    ]),
  ]

  return { releaseIds, assetIds }
}

/**
 * Press-kit downloads linked to an artist via releases or assets.
 */
export async function getDownloadsByArtistId(
  db: DbClient,
  artistId: string,
  limit = 100,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<JournalistDownload[]> {
  const { releaseIds, assetIds } = await collectArtistAssetAndReleaseIds(db, artistId)
  const orParts: string[] = []
  if (releaseIds.length > 0) orParts.push(`release_id.in.(${releaseIds.join(',')})`)
  if (assetIds.length > 0) orParts.push(`asset_id.in.(${assetIds.join(',')})`)
  if (orParts.length === 0) return []

  const { data, error } = await db
    .from('journalist_downloads')
    .select('*')
    .eq('organization_id', organizationId)
    .or(orParts.join(','))
    .order('downloaded_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToDownload)
}

export async function getAllJournalistDownloads(
  db: DbClient,
  limit = 2000,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<JournalistDownload[]> {
  const { data, error } = await db
    .from('journalist_downloads')
    .select('*')
    .eq('organization_id', organizationId)
    .order('downloaded_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToDownload)
}

export async function getPressDownloadStatsByArtistId(
  db: DbClient,
  artistId: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<ArtistPressDownloadStats> {
  const downloads = await getDownloadsByArtistId(db, artistId, 500, organizationId)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()
  const last30Days = downloads.filter((d) => d.downloadedAt >= thirtyDaysAgo).length
  const uniqueJournalists = new Set(downloads.map((d) => d.journalistId)).size

  return {
    totalDownloads: downloads.length,
    last30Days,
    uniqueJournalists,
    recentDownloads: downloads.slice(0, 10),
  }
}
