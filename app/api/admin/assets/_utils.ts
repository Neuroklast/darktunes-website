import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import { createR2Client, deleteObjectFromR2 } from '@/lib/r2Utils'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export interface AssetDeleteRow {
  id: string
  r2Key: string
}

export async function getAssetsForDeletion(db: DbClient, ids: string[]): Promise<AssetDeleteRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await db
    .from('assets')
    .select('id, r2_key')
    .in('id', ids)

  if (error) throw new ApiError(500, error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    r2Key: row.r2_key,
  }))
}

export async function getAssetsInFolders(db: DbClient, folderIds: string[]): Promise<AssetDeleteRow[]> {
  if (folderIds.length === 0) return []
  const { data, error } = await db
    .from('assets')
    .select('id, r2_key')
    .in('folder_id', folderIds)

  if (error) throw new ApiError(500, error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    r2Key: row.r2_key,
  }))
}

export async function collectDescendantFolderIds(db: DbClient, folderId: string): Promise<string[]> {
  const { data, error } = await db
    .from('asset_folders')
    .select('id, parent_id')

  if (error) throw new ApiError(500, error.message)

  const byParent = new Map<string | null, string[]>()
  for (const row of data ?? []) {
    const siblings = byParent.get(row.parent_id ?? null) ?? []
    siblings.push(row.id)
    byParent.set(row.parent_id ?? null, siblings)
  }

  const ids: string[] = []
  const queue = [folderId]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || ids.includes(current)) continue
    ids.push(current)
    queue.push(...(byParent.get(current) ?? []))
  }

  return ids
}

export async function deleteR2Objects(
  assets: AssetDeleteRow[],
  organizationId?: string,
): Promise<void> {
  if (assets.length === 0) return

  const { serverEnv } = await import('@/lib/env.server')
  const r2 = createR2Client(
    serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
    serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
    serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  )

  for (const asset of assets) {
    await deleteObjectFromR2(
      asset.r2Key,
      r2,
      serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
      organizationId,
    )
  }
}
