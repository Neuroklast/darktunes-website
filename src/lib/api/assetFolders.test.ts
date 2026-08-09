import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createFolder, deleteFolder, getFolderPath, renameFolder } from './assetFolders'

type DbClient = SupabaseClient<Database>

type QueryResult = { data: unknown; error: { message: string } | null }

function createThenable(result: QueryResult) {
  const promise = Promise.resolve(result)
  return {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
}

function makeBuilder(result: QueryResult) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() => createThenable(result)),
    ...createThenable(result),
  }
}

function makeMockDb(results: QueryResult[]): DbClient {
  let index = 0
  return {
    from: vi.fn().mockImplementation(() => makeBuilder(results[Math.min(index++, results.length - 1)])),
  } as unknown as DbClient
}

const folderRow: Database['public']['Tables']['asset_folders']['Row'] = {
  organization_id: '00000000-0000-0000-0000-000000000000',
  id: 'folder-1',
  name: 'Press Kit',
  parent_id: null,
  artist_id: 'artist-1',
  created_by: 'user-1',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

describe('assetFolders DAL', () => {
  it('creates and maps a folder', async () => {
    // First call: duplicate-check → no existing folder; second call: insert → returns new row
    const db = makeMockDb([{ data: null, error: null }, { data: folderRow, error: null }])
    const folder = await createFolder(db, 'Press Kit', null, 'artist-1', 'user-1')
    expect(folder.name).toBe('Press Kit')
    expect(folder.artistId).toBe('artist-1')
  })

  it('renames a folder', async () => {
    const db = makeMockDb([{ data: { ...folderRow, name: 'Renamed' }, error: null }])
    const folder = await renameFolder(db, 'folder-1', 'Renamed')
    expect(folder.name).toBe('Renamed')
  })

  it('deletes a folder', async () => {
    const db = makeMockDb([{ data: null, error: null }])
    await expect(deleteFolder(db, 'folder-1')).resolves.toBeUndefined()
  })

  it('builds a breadcrumb path from parent links', async () => {
    const db = makeMockDb([
      { data: { ...folderRow, id: 'child', name: 'Child', parent_id: 'parent' }, error: null },
      { data: { ...folderRow, id: 'parent', name: 'Parent', parent_id: null }, error: null },
    ])
    const path = await getFolderPath(db, 'child')
    expect(path.map((folder) => folder.name)).toEqual(['Parent', 'Child'])
  })
})
