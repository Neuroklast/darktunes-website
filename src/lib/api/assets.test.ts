import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  batchDeleteAssets,
  bulkSetPressApproved,
  createAssetRecord,
  deleteAssetRecord,
  getAssetByHash,
  getAssets,
  getAssetsByArtist,
  getAssetsByFolder,
  getAssetsByIds,
  getPressAssets,
  moveAsset,
  searchAssets,
  updateAsset,
} from './assets'

type DbClient = SupabaseClient<Database>
type AssetRow = Database['public']['Tables']['assets']['Row']
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
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
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

const mockRow: AssetRow = {
  id: 'asset-uuid-1',
  organization_id: '00000000-0000-0000-0000-000000000000',
  filename: 'abc.jpg',
  original_filename: 'photo.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 204800,
  r2_key: 'uploads/abc.jpg',
  public_url: 'https://cdn.darktunes.com/uploads/abc.jpg',
  uploaded_by: 'user-uuid-1',
  created_at: '2026-05-01T12:00:00Z',
  folder_id: 'folder-1',
  artist_id: 'artist-1',
  tags: ['cover', 'promo'],
  sha256_hash: 'abc123',
  release_id: null,
  alt_text: 'Band on stage',
  is_press_approved: true,
  press_suggested: false,
  press_category: 'live',
  press_caption: null,
  photographer_credit: 'Jane Doe',
  downloadable_for_press: true,
}

describe('assets DAL', () => {
  it('maps rows to Asset domain objects', async () => {
    const db = makeMockDb([{ data: [mockRow], error: null }])
    const result = await getAssets(db)
    expect(result[0]).toMatchObject({
      id: 'asset-uuid-1',
      originalFilename: 'photo.jpg',
      folderId: 'folder-1',
      artistId: 'artist-1',
      tags: ['cover', 'promo'],
      sha256Hash: 'abc123',
      isPressApproved: true,
      pressCategory: 'live',
      photographerCredit: 'Jane Doe',
    })
  })

  it('filters assets by folder', async () => {
    const db = makeMockDb([{ data: [mockRow], error: null }])
    const result = await getAssetsByFolder(db, 'folder-1')
    expect(result).toHaveLength(1)
  })

  it('searches assets by original filename', async () => {
    const db = makeMockDb([{ data: [mockRow], error: null }])
    const result = await searchAssets(db, 'photo')
    expect(result[0].originalFilename).toBe('photo.jpg')
  })

  it('creates an asset record', async () => {
    const db = makeMockDb([{ data: mockRow, error: null }])
    const result = await createAssetRecord(db, {
      filename: 'abc.jpg',
      original_filename: 'photo.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 204800,
      r2_key: 'uploads/abc.jpg',
      public_url: 'https://cdn.darktunes.com/uploads/abc.jpg',
      uploaded_by: 'user-uuid-1',
      folder_id: 'folder-1',
      artist_id: 'artist-1',
      tags: ['cover', 'promo'],
      sha256_hash: 'abc123',
    })
    expect(result.tags).toEqual(['cover', 'promo'])
  })

  it('updates an asset', async () => {
    const db = makeMockDb([{ data: { ...mockRow, original_filename: 'new-name.jpg' }, error: null }])
    const result = await updateAsset(db, 'asset-uuid-1', { originalFilename: 'new-name.jpg' })
    expect(result.originalFilename).toBe('new-name.jpg')
  })

  it('moves an asset to another folder', async () => {
    const db = makeMockDb([{ data: { ...mockRow, folder_id: 'folder-2' }, error: null }])
    const result = await moveAsset(db, 'asset-uuid-1', 'folder-2')
    expect(result.folderId).toBe('folder-2')
  })

  it('finds an asset by hash', async () => {
    const db = makeMockDb([{ data: mockRow, error: null }])
    const result = await getAssetByHash(db, 'abc123')
    expect(result?.sha256Hash).toBe('abc123')
  })

  it('gets assets by artist', async () => {
    const db = makeMockDb([{ data: [mockRow], error: null }])
    const result = await getAssetsByArtist(db, 'artist-1')
    expect(result[0].artistId).toBe('artist-1')
  })

  it('batch deletes assets', async () => {
    const db = makeMockDb([{ data: null, error: null }])
    await expect(batchDeleteAssets(db, ['asset-uuid-1'])).resolves.toBeUndefined()
  })

  it('deletes an asset record', async () => {
    const db = makeMockDb([{ data: null, error: null }])
    await expect(deleteAssetRecord(db, 'asset-uuid-1')).resolves.toBeUndefined()
  })

  it('throws when Supabase returns an error', async () => {
    const db = makeMockDb([{ data: null, error: { message: 'DB error' } }])
    await expect(getAssets(db)).rejects.toThrow('DB error')
  })

  it('filters press-approved assets', async () => {
    const db = makeMockDb([{ data: [mockRow], error: null }])
    const result = await getPressAssets(db, { isPressApproved: true })
    expect(result[0].isPressApproved).toBe(true)
  })

  it('returns assets by ids', async () => {
    const db = makeMockDb([{ data: [mockRow], error: null }])
    const result = await getAssetsByIds(db, ['asset-uuid-1'])
    expect(result).toHaveLength(1)
  })

  it('returns empty array for empty id list', async () => {
    const db = makeMockDb([{ data: [], error: null }])
    const result = await getAssetsByIds(db, [])
    expect(result).toEqual([])
    expect(db.from).not.toHaveBeenCalled()
  })

  it('bulk sets press approved flag', async () => {
    const db = makeMockDb([{ data: [{ id: 'asset-uuid-1' }], error: null }])
    const count = await bulkSetPressApproved(db, ['asset-uuid-1'], true)
    expect(count).toBe(1)
  })

  it('updates press metadata fields', async () => {
    const db = makeMockDb([
      {
        data: {
          ...mockRow,
          press_caption: 'On stage at Wacken',
          is_press_approved: true,
        },
        error: null,
      },
    ])
    const result = await updateAsset(db, 'asset-uuid-1', {
      pressCaption: 'On stage at Wacken',
      isPressApproved: true,
    })
    expect(result.isPressApproved).toBe(true)
  })

  it('moves asset into artist folder when assigning a single artist', async () => {
    const artistFolderId = 'artist-folder-1'
    const movedRow = { ...mockRow, folder_id: artistFolderId, artist_id: 'artist-1' }
    // Sequence: update tags empty path fetch → delete junction → insert junction →
    // sync artist_id → list folders → update folder_id → re-fetch asset → list artistIds
    const db = makeMockDb([
      { data: mockRow, error: null }, // fetch current (empty dbUpdates)
      { data: null, error: null }, // delete asset_artists
      { data: null, error: null }, // insert asset_artists
      { data: null, error: null }, // sync artist_id
      { data: [{ id: artistFolderId, artist_id: 'artist-1', name: 'Band', parent_id: 'artists-root' }], error: null }, // folders
      { data: null, error: null }, // update folder_id
      { data: movedRow, error: null }, // re-fetch asset
      { data: [{ artist_id: 'artist-1' }], error: null }, // asset_artists for return
    ])
    const result = await updateAsset(db, 'asset-uuid-1', { artistIds: ['artist-1'] })
    expect(result.folderId).toBe(artistFolderId)
    expect(result.artistIds).toEqual(['artist-1'])
  })

  it('moves multi-artist assets into primary collabs subfolder', async () => {
    const artistFolderId = 'artist-folder-1'
    const collabsId = 'collabs-1'
    const movedRow = { ...mockRow, folder_id: collabsId, artist_id: 'artist-1' }
    const db = makeMockDb([
      { data: mockRow, error: null }, // fetch current
      { data: null, error: null }, // delete junction
      { data: null, error: null }, // insert junction
      { data: null, error: null }, // sync artist_id
      {
        data: [
          { id: artistFolderId, artist_id: 'artist-1', name: 'Band A', parent_id: 'artists-root' },
          { id: 'artist-folder-2',
  organization_id: '00000000-0000-0000-0000-000000000000', artist_id: 'artist-2', name: 'Band B', parent_id: 'artists-root' },
        ],
        error: null,
      }, // resolve folders
      { data: { id: collabsId }, error: null }, // existing collabs maybeSingle
      { data: null, error: null }, // update folder_id
      { data: movedRow, error: null }, // re-fetch
      { data: [{ artist_id: 'artist-1' }, { artist_id: 'artist-2' }], error: null },
    ])
    const result = await updateAsset(db, 'asset-uuid-1', { artistIds: ['artist-1', 'artist-2'] })
    expect(result.folderId).toBe(collabsId)
  })
})
