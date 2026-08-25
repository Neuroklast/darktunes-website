/**
 * src/lib/api/pressKit.ts
 *
 * Data Access Layer for curated press kits (press_kit_items + assets).
 * Public EPK pages and the journalist dashboard read via getPressKitForArtist().
 * Admin curation uses getPressKitItemsByScope() for a single kit (label-wide or per artist).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PressAsset, PressKitItem } from '@/types'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { rowToAsset } from './assets'
import { mergePortalGalleryPhotos } from './portalGalleryPress'

type DbClient = SupabaseClient<Database>
type KitItemRow = Database['public']['Tables']['press_kit_items']['Row']
type KitItemInsert = Database['public']['Tables']['press_kit_items']['Insert']
type AssetRow = Database['public']['Tables']['assets']['Row']

type KitItemWithAsset = KitItemRow & { assets: AssetRow | null }

function rowToPressKitItem(row: KitItemRow): PressKitItem {
  return {
    id: row.id,
    assetId: row.asset_id,
    artistId: row.artist_id ?? undefined,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  }
}

function rowToPressAsset(row: KitItemWithAsset): PressAsset | null {
  if (!row.assets) return null
  const asset = rowToAsset(row.assets)
  return {
    ...asset,
    kitItemId: row.id,
    kitDisplayOrder: row.display_order,
    kitArtistId: row.artist_id ?? undefined,
  }
}

function filterKitRowsByOrganization(
  rows: KitItemWithAsset[],
  organizationId: string,
): KitItemWithAsset[] {
  return rows.filter((row) => {
    const assetOrg = row.assets?.organization_id
    if (!assetOrg) return true
    return assetOrg === organizationId
  })
}

/** All kit items for one scope: artistId = null → label-wide kit only. */
export async function getPressKitItemsByScope(
  db: DbClient,
  artistId: string | null,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PressAsset[]> {
  const query = db
    .from('press_kit_items')
    .select('*, assets(*)')
    .order('display_order', { ascending: true })

  if (artistId === null) {
    query.is('artist_id', null)
  } else {
    query.eq('artist_id', artistId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return filterKitRowsByOrganization((data ?? []) as KitItemWithAsset[], organizationId)
    .map((row) => rowToPressAsset(row))
    .filter((item): item is PressAsset => item !== null)
}

/**
 * Press kit for a public artist EPK: label-wide items (artist_id IS NULL)
 * plus items scoped to the given artist.
 */
export async function getPressKitForArtist(db: DbClient, artistId: string): Promise<PressAsset[]> {
  const [kitResult, profileResult] = await Promise.all([
    db
      .from('press_kit_items')
      .select('*, assets(*)')
      .or(`artist_id.is.null,artist_id.eq.${artistId}`)
      .order('display_order', { ascending: true }),
    db
      .from('artist_epks')
      .select('epk_gallery_photos')
      .eq('artist_id', artistId)
      .maybeSingle(),
  ])

  if (kitResult.error) throw new Error(kitResult.error.message)
  if (profileResult.error) throw new Error(profileResult.error.message)

  const kitPhotos = (kitResult.data ?? [])
    .map((row) => rowToPressAsset(row as KitItemWithAsset))
    .filter((item): item is PressAsset => item !== null)
    .filter((item) => item.isPressApproved && item.downloadableForPress)

  return mergePortalGalleryPhotos(kitPhotos, profileResult.data?.epk_gallery_photos ?? [], artistId)
}

/** All press kit items (admin overview), optionally filtered by artist scope. */
export async function getPressKitItems(
  db: DbClient,
  artistId?: string | null,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PressAsset[]> {
  if (artistId !== undefined) {
    return getPressKitItemsByScope(db, artistId, organizationId)
  }

  const { data, error } = await db
    .from('press_kit_items')
    .select('*, assets(*)')
    .order('display_order', { ascending: true })

  if (error) throw new Error(error.message)

  return filterKitRowsByOrganization((data ?? []) as KitItemWithAsset[], organizationId)
    .map((row) => rowToPressAsset(row))
    .filter((item): item is PressAsset => item !== null)
}

export async function addToPressKit(
  db: DbClient,
  input: { assetId: string; artistId?: string | null; displayOrder?: number },
): Promise<PressKitItem> {
  const artistId = input.artistId ?? null
  let displayOrder = input.displayOrder

  if (displayOrder === undefined) {
    const countQuery = db
      .from('press_kit_items')
      .select('id', { count: 'exact', head: true })

    if (artistId === null) {
      countQuery.is('artist_id', null)
    } else {
      countQuery.eq('artist_id', artistId)
    }

    const { count, error: countError } = await countQuery
    if (countError) throw new Error(countError.message)
    displayOrder = count ?? 0
  }

  const insert: KitItemInsert = {
    asset_id: input.assetId,
    artist_id: artistId,
    display_order: displayOrder,
  }

  const { data, error } = await db.from('press_kit_items').insert(insert).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from addToPressKit')
  return rowToPressKitItem(data)
}

export async function removeFromPressKit(db: DbClient, itemId: string): Promise<void> {
  const { error } = await db.from('press_kit_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
}

export async function reorderPressKit(
  db: DbClient,
  artistId: string | null,
  orderedItemIds: string[],
): Promise<void> {
  for (let index = 0; index < orderedItemIds.length; index += 1) {
    const itemId = orderedItemIds[index]
    let query = db
      .from('press_kit_items')
      .update({ display_order: index })
      .eq('id', itemId)

    if (artistId === null) {
      query = query.is('artist_id', null)
    } else {
      query = query.eq('artist_id', artistId)
    }

    const { error } = await query
    if (error) throw new Error(error.message)
  }
}

export async function bulkAddToPressKit(
  db: DbClient,
  assetIds: string[],
  artistId: string | null,
): Promise<PressKitItem[]> {
  const results: PressKitItem[] = []
  for (const assetId of assetIds) {
    try {
      const item = await addToPressKit(db, { assetId, artistId })
      results.push(item)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Skip duplicates (unique index on asset_id + artist_id scope)
      if (message.includes('duplicate') || message.includes('unique')) continue
      throw error
    }
  }
  return results
}

/** All curated press kit assets visible to journalists (approved + downloadable). */
export async function getJournalistPressKit(db: DbClient): Promise<PressAsset[]> {
  const items = await getPressKitItems(db)
  return items.filter((item) => item.isPressApproved && item.downloadableForPress)
}

export async function bulkRemoveFromPressKitByAssetIds(
  db: DbClient,
  assetIds: string[],
  artistId: string | null,
): Promise<number> {
  if (assetIds.length === 0) return 0

  let query = db.from('press_kit_items').delete().in('asset_id', assetIds)

  if (artistId === null) {
    query = query.is('artist_id', null)
  } else {
    query = query.eq('artist_id', artistId)
  }

  const { data, error } = await query.select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}