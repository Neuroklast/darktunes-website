import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asset } from '@/types'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>
type AssetRow = Database['public']['Tables']['assets']['Row']
export type AssetInsert = Database['public']['Tables']['assets']['Insert']

export function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    filename: row.filename,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    r2Key: row.r2_key,
    publicUrl: row.public_url,
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: row.created_at,
    folderId: row.folder_id ?? undefined,
    artistId: row.artist_id ?? undefined,
    artistIds: [],
    releaseId: row.release_id ?? undefined,
    tags: row.tags ?? [],
    sha256Hash: row.sha256_hash ?? undefined,
    altText: row.alt_text ?? undefined,
    isPressApproved: row.is_press_approved ?? false,
    pressSuggested: row.press_suggested ?? false,
    pressCategory: (row.press_category as Asset['pressCategory']) ?? undefined,
    pressCaption: row.press_caption ?? undefined,
    photographerCredit: row.photographer_credit ?? undefined,
    downloadableForPress: row.downloadable_for_press ?? true,
  }
}

export async function getAssets(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Asset[]> {
  const { data, error } = await db
    .from('assets')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAsset)
}

export async function getAssetsByFolder(
  db: DbClient,
  folderId: string | null,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Asset[]> {
  let query = db
    .from('assets')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (folderId === null) {
    query = query.is('folder_id', null)
  } else {
    query = query.eq('folder_id', folderId)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAsset)
}

export interface PressAssetFilters {
  isPressApproved?: boolean
  pressSuggested?: boolean
  pressCategory?: string
  artistId?: string
}

export async function getPressAssets(
  db: DbClient,
  filters: PressAssetFilters & { organizationId?: string } = {},
): Promise<Asset[]> {
  const organizationId = filters.organizationId ?? DEFAULT_ORGANIZATION_ID
  let query = db
    .from('assets')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (filters.isPressApproved !== undefined) {
    query = query.eq('is_press_approved', filters.isPressApproved)
  }
  if (filters.pressSuggested !== undefined) {
    query = query.eq('press_suggested', filters.pressSuggested)
  }
  if (filters.pressCategory) {
    query = query.eq('press_category', filters.pressCategory)
  }
  if (filters.artistId) {
    query = query.eq('artist_id', filters.artistId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAsset)
}

export async function getAssetsByIds(db: DbClient, ids: string[]): Promise<Asset[]> {
  if (ids.length === 0) return []
  const { data, error } = await db.from('assets').select('*').in('id', ids)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAsset)
}

export async function bulkSetPressApproved(
  db: DbClient,
  assetIds: string[],
  approved: boolean,
): Promise<number> {
  if (assetIds.length === 0) return 0
  const { data, error } = await db
    .from('assets')
    .update({ is_press_approved: approved })
    .in('id', assetIds)
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export async function searchAssets(
  db: DbClient,
  query: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Asset[]> {
  const { data, error } = await db
    .from('assets')
    .select('*')
    .eq('organization_id', organizationId)
    .ilike('original_filename', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAsset)
}

export async function createAssetRecord(db: DbClient, assetData: AssetInsert): Promise<Asset> {
  assetData = {
    ...assetData,
    organization_id: assetData.organization_id ?? DEFAULT_ORGANIZATION_ID,
  }
  const { data, error } = await db.from('assets').insert(assetData).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createAssetRecord')
  return rowToAsset(data)
}

export async function updateAsset(
  db: DbClient,
  id: string,
  updates: {
    folderId?: string | null
    artistId?: string | null
    artistIds?: string[]
    releaseId?: string | null
    tags?: string[]
    originalFilename?: string
    altText?: string | null
    isPressApproved?: boolean
    pressSuggested?: boolean
    pressCategory?: string | null
    pressCaption?: string | null
    photographerCredit?: string | null
    downloadableForPress?: boolean
  },
): Promise<Asset> {
  const dbUpdates: Database['public']['Tables']['assets']['Update'] = {}
  if ('folderId' in updates) dbUpdates.folder_id = updates.folderId ?? null
  if ('artistId' in updates) dbUpdates.artist_id = updates.artistId ?? null
  if ('releaseId' in updates) dbUpdates.release_id = updates.releaseId ?? null
  if ('tags' in updates) dbUpdates.tags = updates.tags ?? []
  if ('originalFilename' in updates) dbUpdates.original_filename = updates.originalFilename ?? ''
  if ('altText' in updates) dbUpdates.alt_text = updates.altText ?? null
  if ('isPressApproved' in updates) dbUpdates.is_press_approved = updates.isPressApproved ?? false
  if ('pressSuggested' in updates) dbUpdates.press_suggested = updates.pressSuggested ?? false
  if ('pressCategory' in updates) dbUpdates.press_category = updates.pressCategory ?? null
  if ('pressCaption' in updates) dbUpdates.press_caption = updates.pressCaption ?? null
  if ('photographerCredit' in updates) dbUpdates.photographer_credit = updates.photographerCredit ?? null
  if ('downloadableForPress' in updates) {
    dbUpdates.downloadable_for_press = updates.downloadableForPress ?? true
  }

  // When only junction-table fields (artistIds) are updated, dbUpdates is
  // empty. Calling .update({}) throws "Nothing to update" in Supabase.
  // Instead, fetch the current row so downstream code still has a `data` ref.
  let data: AssetRow
  if (Object.keys(dbUpdates).length === 0) {
    const { data: fetched, error: fetchErr } = await db.from('assets').select('*').eq('id', id).single()
    if (fetchErr) throw new Error(fetchErr.message)
    if (!fetched) throw new Error('Asset not found')
    data = fetched
  } else {
    const { data: updated, error } = await db.from('assets').update(dbUpdates).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    if (!updated) throw new Error('No data returned')
    data = updated
  }

  // If artistIds explicitly provided, replace the asset_artists junction rows
  if ('artistIds' in updates && updates.artistIds !== undefined) {
    await db.from('asset_artists').delete().eq('asset_id', id)
    if (updates.artistIds.length > 0) {
      const rows = updates.artistIds.map((artistId) => ({ asset_id: id, artist_id: artistId }))
      const { error: insertError } = await db.from('asset_artists').insert(rows)
      if (insertError) throw new Error(insertError.message)
    }
    // Keep the direct artist_id column in sync with the first assigned artist
    const primaryArtistId = updates.artistIds[0] ?? null
    const { error: syncErr } = await db
      .from('assets')
      .update({ artist_id: primaryArtistId })
      .eq('id', id)
    if (syncErr) throw new Error(syncErr.message)
    // Move into artist folder (single) or collabs under primary (multi)
    if (updates.artistIds.length > 0) {
      await ensureArtistFolderPlacement(db, id, updates.artistIds)
      const { data: refreshed, error: refreshErr } = await db
        .from('assets')
        .select('*')
        .eq('id', id)
        .single()
      if (refreshErr) throw new Error(refreshErr.message)
      if (refreshed) data = refreshed
    }
  }

  const asset = rowToAsset(data)
  // Fetch the current artistIds for the return value
  const { data: aaRows } = await db.from('asset_artists').select('artist_id').eq('asset_id', id)
  asset.artistIds = Array.isArray(aaRows) ? aaRows.map((r) => r.artist_id) : []
  return asset
}

/**
 * Ensure each artist has a dedicated folder under the top-level "artists" root
 * (same layout as `create_artist_asset_folder` trigger), then place the asset:
 * - 1 artist → that artist's folder
 * - 2+ artists → primary artist's "collabs" subfolder
 *
 * Always updates folder_id on assign (not only when null).
 */
async function ensureArtistFolderPlacement(
  db: DbClient,
  assetId: string,
  artistIds: string[],
): Promise<void> {
  if (artistIds.length === 0) return

  const primaryArtistId = artistIds[0]
  if (!primaryArtistId) return

  const folderIdByArtist = await resolveArtistFolderIds(db, artistIds)
  const primaryFolderId = folderIdByArtist.get(primaryArtistId)
  if (!primaryFolderId) return

  let targetFolderId = primaryFolderId

  if (artistIds.length > 1) {
    targetFolderId = await ensureCollabsSubfolder(db, primaryFolderId, primaryArtistId)
  }

  const { error } = await db
    .from('assets')
    .update({ folder_id: targetFolderId })
    .eq('id', assetId)
  if (error) throw new Error(error.message)
}

async function ensureArtistsRootFolder(db: DbClient): Promise<string> {
  const { data: existing } = await db
    .from('asset_folders')
    .select('id')
    .eq('name', 'artists')
    .is('parent_id', null)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: created, error } = await db
    .from('asset_folders')
    .insert({ name: 'artists', parent_id: null, artist_id: null, created_by: null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  if (!created) throw new Error('Failed to create artists root folder')
  return created.id
}

/**
 * Map artistId → dedicated folder id (not "collabs").
 * Creates missing folders under the "artists" root when needed.
 */
async function resolveArtistFolderIds(
  db: DbClient,
  artistIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (artistIds.length === 0) return result

  const { data: folders, error } = await db
    .from('asset_folders')
    .select('id, artist_id, name, parent_id')
    .in('artist_id', artistIds)
  if (error) throw new Error(error.message)

  // Prefer dedicated non-collabs folders; one per artist
  for (const folder of folders ?? []) {
    if (!folder.artist_id) continue
    if (folder.name.toLowerCase() === 'collabs') continue
    if (!result.has(folder.artist_id)) {
      result.set(folder.artist_id, folder.id)
    }
  }

  // If only a "collabs" folder exists, prefer its parent (the artist folder)
  for (const folder of folders ?? []) {
    if (!folder.artist_id || result.has(folder.artist_id)) continue
    if (folder.name.toLowerCase() !== 'collabs') continue
    if (folder.parent_id) {
      result.set(folder.artist_id, folder.parent_id)
    }
  }

  const missing = artistIds.filter((id) => !result.has(id))
  if (missing.length === 0) return result

  const artistsRootId = await ensureArtistsRootFolder(db)
  const { data: artists, error: artistsErr } = await db
    .from('artists')
    .select('id, name')
    .in('id', missing)
  if (artistsErr) throw new Error(artistsErr.message)

  for (const artist of artists ?? []) {
    const { data: created, error: createErr } = await db
      .from('asset_folders')
      .insert({
        name: artist.name,
        parent_id: artistsRootId,
        artist_id: artist.id,
        created_by: null,
      })
      .select('id')
      .single()

    if (createErr) {
      // Race: folder may have been created concurrently — re-fetch non-collabs
      const { data: racedRows } = await db
        .from('asset_folders')
        .select('id, name')
        .eq('artist_id', artist.id)
      const raced = (racedRows ?? []).find((f) => f.name.toLowerCase() !== 'collabs')
      if (raced?.id) {
        result.set(artist.id, raced.id)
        continue
      }
      throw new Error(createErr.message)
    }
    if (created) result.set(artist.id, created.id)
  }

  return result
}

async function ensureCollabsSubfolder(
  db: DbClient,
  parentFolderId: string,
  artistId: string,
): Promise<string> {
  const { data: existing } = await db
    .from('asset_folders')
    .select('id')
    .eq('parent_id', parentFolderId)
    .ilike('name', 'collabs')
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: created, error } = await db
    .from('asset_folders')
    .insert({
      name: 'collabs',
      parent_id: parentFolderId,
      artist_id: artistId,
      created_by: null,
    })
    .select('id')
    .single()

  if (error) {
    const { data: raced } = await db
      .from('asset_folders')
      .select('id')
      .eq('parent_id', parentFolderId)
      .ilike('name', 'collabs')
      .maybeSingle()
    if (raced?.id) return raced.id
    throw new Error(error.message)
  }
  if (!created) throw new Error('Failed to create collabs folder')
  return created.id
}

export async function getAssetByHash(db: DbClient, hash: string): Promise<Asset | null> {
  const { data, error } = await db.from('assets').select('*').eq('sha256_hash', hash).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToAsset(data) : null
}

export async function moveAsset(db: DbClient, id: string, newFolderId: string | null): Promise<Asset> {
  return updateAsset(db, id, { folderId: newFolderId })
}

export async function batchDeleteAssets(db: DbClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db.from('assets').delete().in('id', ids)
  if (error) throw new Error(error.message)
}

export async function getAssetsByArtist(
  db: DbClient,
  artistId: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Asset[]> {
  const { data, error } = await db
    .from('assets')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToAsset)
}

/** Counts label-managed assets assigned to a specific artist. */
export async function countAssetsByArtist(db: DbClient, artistId: string): Promise<number> {
  const { count, error } = await db
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)

  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function deleteAssetRecord(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('assets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
