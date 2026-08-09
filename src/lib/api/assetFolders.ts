import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import type { AssetFolder } from '@/types'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>
type FolderRow = Database['public']['Tables']['asset_folders']['Row']

function rowToFolder(row: FolderRow): AssetFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? null,
    artistId: row.artist_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getFolders(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<AssetFolder[]> {
  const { data, error } = await db
    .from('asset_folders')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToFolder)
}

export async function getFoldersByParent(
  db: DbClient,
  parentId: string | null,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<AssetFolder[]> {
  let query = db
    .from('asset_folders')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
  if (parentId === null) {
    query = query.is('parent_id', null)
  } else {
    query = query.eq('parent_id', parentId)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToFolder)
}

export async function createFolder(
  db: DbClient,
  name: string,
  parentId: string | null,
  artistId: string | null,
  createdBy: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<AssetFolder> {
  // Check for an existing folder with the same name in the same parent (same org)
  let dupQuery = db
    .from('asset_folders')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('name', name)
  if (parentId === null) {
    dupQuery = dupQuery.is('parent_id', null)
  } else {
    dupQuery = dupQuery.eq('parent_id', parentId)
  }
  const { data: existing } = await dupQuery.maybeSingle()
  if (existing) {
    throw new Error(`DUPLICATE_FOLDER:A folder named "${name}" already exists here.`)
  }

  const { data, error } = await db
    .from('asset_folders')
    .insert({
      name,
      parent_id: parentId,
      artist_id: artistId,
      created_by: createdBy,
      organization_id: organizationId,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned')
  return rowToFolder(data)
}

export async function renameFolder(db: DbClient, id: string, name: string): Promise<AssetFolder> {
  const { data, error } = await db
    .from('asset_folders')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned')
  return rowToFolder(data)
}

export async function moveFolder(db: DbClient, id: string, newParentId: string | null): Promise<AssetFolder> {
  const { data, error } = await db
    .from('asset_folders')
    .update({ parent_id: newParentId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned')
  return rowToFolder(data)
}

export async function deleteFolder(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('asset_folders').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getFolderPath(db: DbClient, folderId: string): Promise<AssetFolder[]> {
  const path: AssetFolder[] = []
  let currentId: string | null = folderId
  while (currentId) {
    const { data, error } = await db
      .from('asset_folders')
      .select('*')
      .eq('id', currentId)
      .maybeSingle()
    if (error || !data) break
    const folder = rowToFolder(data)
    path.unshift(folder)
    currentId = folder.parentId
  }
  return path
}
