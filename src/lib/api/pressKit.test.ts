import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  addToPressKit,
  bulkAddToPressKit,
  getJournalistPressKit,
  getPressKitForArtist,
  getPressKitItemsByScope,
  removeFromPressKit,
  reorderPressKit,
} from './pressKit'

type DbClient = SupabaseClient<Database>
type KitItemRow = Database['public']['Tables']['press_kit_items']['Row']
type AssetRow = Database['public']['Tables']['assets']['Row']

type QueryResult = { data: unknown; error: { message: string } | null; count?: number | null }

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
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    ...createThenable(result),
  }
}

function makeMockDb(results: QueryResult[]): DbClient {
  let index = 0
  return {
    from: vi.fn().mockImplementation(() => makeBuilder(results[Math.min(index++, results.length - 1)])),
  } as unknown as DbClient
}

const mockAssetRow: AssetRow = {
  id: 'asset-1',
  organization_id: '00000000-0000-0000-0000-000000000000',
  filename: 'photo.jpg',
  original_filename: 'Band Live',
  mime_type: 'image/jpeg',
  size_bytes: 1024,
  r2_key: 'press-photos/photo.jpg',
  public_url: 'https://cdn.example.com/press-photos/photo.jpg',
  uploaded_by: null,
  created_at: '2026-01-01T00:00:00Z',
  folder_id: null,
  artist_id: 'artist-1',
  tags: [],
  sha256_hash: null,
  release_id: null,
  alt_text: 'Live shot',
  is_press_approved: true,
  press_suggested: false,
  press_category: 'live',
  press_caption: null,
  photographer_credit: 'Jane Doe',
  downloadable_for_press: true,
}

const mockKitRow: KitItemRow = {
  id: 'kit-item-1',
  asset_id: 'asset-1',
  artist_id: 'artist-1',
  display_order: 0,
  created_at: '2026-01-01T00:00:00Z',
}

describe('getPressKitItemsByScope', () => {
  it('maps joined rows to PressAsset objects', async () => {
    const db = makeMockDb([{ data: [{ ...mockKitRow, assets: mockAssetRow }], error: null }])
    const result = await getPressKitItemsByScope(db, 'artist-1')
    expect(result).toHaveLength(1)
    expect(result[0].kitItemId).toBe('kit-item-1')
    expect(result[0].originalFilename).toBe('Band Live')
    expect(result[0].isPressApproved).toBe(true)
  })

  it('throws on database error', async () => {
    const db = makeMockDb([{ data: null, error: { message: 'RLS violation' } }])
    await expect(getPressKitItemsByScope(db, null)).rejects.toThrow('RLS violation')
  })
})

describe('getJournalistPressKit', () => {
  it('returns only approved downloadable kit assets', async () => {
    const blocked = { ...mockAssetRow, downloadable_for_press: false }
    const db = makeMockDb([
      {
        data: [
          { ...mockKitRow, assets: mockAssetRow },
          { ...mockKitRow, id: 'kit-item-2', assets: blocked },
        ],
        error: null,
      },
    ])
    const result = await getJournalistPressKit(db)
    expect(result).toHaveLength(1)
    expect(result[0].downloadableForPress).toBe(true)
  })
})

describe('getPressKitForArtist', () => {
  it('filters out non-approved assets', async () => {
    const unapproved = { ...mockAssetRow, is_press_approved: false }
    const db = makeMockDb([
      {
        data: [
          { ...mockKitRow, assets: mockAssetRow },
          { ...mockKitRow, id: 'kit-item-2', assets: unapproved },
        ],
        error: null,
      },
      { data: { epk_gallery_photos: [] }, error: null },
    ])
    const result = await getPressKitForArtist(db, 'artist-1')
    expect(result).toHaveLength(1)
    expect(result[0].kitItemId).toBe('kit-item-1')
  })

  it('includes portal gallery photos from artist_epks', async () => {
    const galleryUrl = 'https://cdn.example.com/profile-photos/artist-1/gallery.jpg'
    const db = makeMockDb([
      { data: [], error: null },
      { data: { epk_gallery_photos: [galleryUrl] }, error: null },
    ])
    const result = await getPressKitForArtist(db, 'artist-1')
    expect(result).toHaveLength(1)
    expect(result[0].publicUrl).toBe(galleryUrl)
    expect(result[0].downloadableForPress).toBe(true)
  })
})

describe('addToPressKit', () => {
  it('inserts with auto display order when omitted', async () => {
    const db = makeMockDb([
      { data: null, error: null, count: 2 },
      { data: { ...mockKitRow, display_order: 2 }, error: null },
    ])
    const result = await addToPressKit(db, { assetId: 'asset-1', artistId: 'artist-1' })
    expect(result.displayOrder).toBe(2)
    expect(result.assetId).toBe('asset-1')
  })

  it('throws when insert returns no row', async () => {
    const db = makeMockDb([
      { data: null, error: null, count: 0 },
      { data: null, error: null },
    ])
    await expect(addToPressKit(db, { assetId: 'asset-1' })).rejects.toThrow(
      'No data returned from addToPressKit',
    )
  })
})

describe('removeFromPressKit', () => {
  it('resolves on success', async () => {
    const db = makeMockDb([{ data: null, error: null }])
    await expect(removeFromPressKit(db, 'kit-item-1')).resolves.toBeUndefined()
  })
})

describe('reorderPressKit', () => {
  it('updates display_order for each item', async () => {
    const db = makeMockDb([
      { data: null, error: null },
      { data: null, error: null },
    ])
    await expect(
      reorderPressKit(db, 'artist-1', ['kit-item-1', 'kit-item-2']),
    ).resolves.toBeUndefined()
    expect(db.from).toHaveBeenCalledTimes(2)
  })
})

describe('bulkAddToPressKit', () => {
  it('skips duplicate kit entries', async () => {
    const db = makeMockDb([
      { data: null, error: null, count: 0 },
      { data: mockKitRow, error: null },
      { data: null, error: null, count: 1 },
      { data: null, error: { message: 'duplicate key value violates unique constraint' } },
    ])
    const result = await bulkAddToPressKit(db, ['asset-1', 'asset-2'], 'artist-1')
    expect(result).toHaveLength(1)
  })
})