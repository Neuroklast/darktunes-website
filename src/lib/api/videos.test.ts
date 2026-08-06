import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getVideos,
  getPublicVideos,
  getPublicVideosByArtistId,
  createVideo,
  updateVideo,
  deleteVideo,
  getVideosByArtistId,
} from './videos'

type DbClient = SupabaseClient<Database>
type VideoRow = Database['public']['Tables']['videos']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const mockVideoRow: VideoRow = {
  id: 'vid-001',
  title: 'Monsters (Official Music Video)',
  artist_id: 'artist-001',
  youtube_id: 'Bx51eegLTY8',
  thumbnail_url: 'https://img.youtube.com/vi/Bx51eegLTY8/maxresdefault.jpg',
  is_visible: true,
  is_short: false,
  published_at: '2024-04-24T00:00:00Z',
  created_at: '2024-04-24T00:00:00Z',
  updated_at: '2024-04-24T00:00:00Z',
}

describe('getVideos', () => {
  it('returns an empty array when there are no videos', async () => {
    const db = makeMockDb([])
    const result = await getVideos(db)
    expect(result).toEqual([])
  })

  it('maps rows to Video domain objects', async () => {
    const db = makeMockDb([mockVideoRow])
    const result = await getVideos(db)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Monsters (Official Music Video)')
    expect(result[0].youtubeId).toBe('Bx51eegLTY8')
    expect(result[0].artistName).toBe('')
    expect(result[0].artistId).toBe('artist-001')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Query error', code: 'PGRST001' })
    await expect(getVideos(db)).rejects.toThrow('Query error')
  })
})

describe('getVideosByArtistId', () => {
  it('returns videos filtered by artist id', async () => {
    const db = makeMockDb([mockVideoRow])
    const result = await getVideosByArtistId(db, 'artist-001')
    expect(result).toHaveLength(1)
    expect(result[0].artistId).toBe('artist-001')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Artist query failed', code: 'PGRST001' })
    await expect(getVideosByArtistId(db, 'artist-001')).rejects.toThrow('Artist query failed')
  })
})

describe('createVideo', () => {
  it('returns the created Video', async () => {
    const db = makeMockDb(mockVideoRow)
    const result = await createVideo(db, {
      title: 'Monsters',
      youtube_id: 'Bx51eegLTY8',
    })
    expect(result.id).toBe('vid-001')
    expect(result.youtubeId).toBe('Bx51eegLTY8')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Duplicate youtube_id', code: '23505' })
    await expect(
      createVideo(db, { title: 'Monsters', youtube_id: 'Bx51eegLTY8' }),
    ).rejects.toThrow('Duplicate youtube_id')
  })

  it('throws when no data returned', async () => {
    const db = makeMockDb(null)
    await expect(
      createVideo(db, { title: 'Monsters', youtube_id: 'Bx51eegLTY8' }),
    ).rejects.toThrow('No data returned from createVideo')
  })
})

describe('updateVideo', () => {
  it('returns the updated Video', async () => {
    const updated = { ...mockVideoRow, title: 'Updated Title' }
    const db = makeMockDb(updated)
    const result = await updateVideo(db, 'vid-001', { title: 'Updated Title' })
    expect(result.title).toBe('Updated Title')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Update failed', code: 'PGRST001' })
    await expect(updateVideo(db, 'vid-001', { title: 'X' })).rejects.toThrow('Update failed')
  })
})

describe('deleteVideo', () => {
  it('resolves without error on success', async () => {
    const db = makeMockDb(null, null)
    await expect(deleteVideo(db, 'vid-001')).resolves.toBeUndefined()
  })

  it('throws when deletion fails', async () => {
    const db = makeMockDb(null, { message: 'Delete denied', code: 'PGRST301' })
    await expect(deleteVideo(db, 'vid-001')).rejects.toThrow('Delete denied')
  })
})

// ---------------------------------------------------------------------------
// getPublicVideos — only returns visible videos
// ---------------------------------------------------------------------------

describe('getPublicVideos', () => {
  it('returns only visible videos', async () => {
    const visibleRow = { ...mockVideoRow, is_visible: true }
    const db = makeMockDb([visibleRow])
    const result = await getPublicVideos(db)
    expect(result).toHaveLength(1)
    expect(result[0].isVisible).toBe(true)
  })

  it('returns an empty array when there are no visible videos', async () => {
    const db = makeMockDb([])
    const result = await getPublicVideos(db)
    expect(result).toEqual([])
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'RLS denied', code: 'PGRST301' })
    await expect(getPublicVideos(db)).rejects.toThrow('RLS denied')
  })

  it('applies is_short=false filter when excludeShorts is true', async () => {
    const db = makeMockDb([])
    const builder = (db.from as unknown as () => ReturnType<typeof makeBuilder>)()
    await getPublicVideos(db, { excludeShorts: true })
    expect(builder.eq).toHaveBeenCalledWith('is_short', false)
  })

  it('does not apply is_short filter when excludeShorts is false', async () => {
    const db = makeMockDb([])
    const builder = (db.from as unknown as () => ReturnType<typeof makeBuilder>)()
    await getPublicVideos(db, { excludeShorts: false })
    const eqCalls = (builder.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(eqCalls.some((call: unknown[]) => call[0] === 'is_short')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getPublicVideosByArtistId
// ---------------------------------------------------------------------------

describe('getPublicVideosByArtistId', () => {
  it('filters by artist_id and is_visible', async () => {
    const builder = makeBuilder([])
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as DbClient
    await getPublicVideosByArtistId(db, 'artist-1')
    expect(builder.eq).toHaveBeenCalledWith('artist_id', 'artist-1')
    expect(builder.eq).toHaveBeenCalledWith('is_visible', true)
  })
})

// ---------------------------------------------------------------------------
// Pagination slice logic (pure, no DB needed)
//
// The Videos component and VideosPageContent both apply this logic to paginate
// a flat array of videos before rendering.  We test it here to ensure edge
// cases are handled correctly.
// ---------------------------------------------------------------------------

describe('pagination slice logic', () => {
  /** Replicates the slice logic used in Videos.tsx and VideosPageContent.tsx */
  function paginate(
    items: unknown[],
    page: number,
    videosPerPage: number,
    videosLinkToPage = false,
  ) {
    const perPage = Math.max(1, videosPerPage)
    const totalPages = Math.ceil(items.length / perPage)
    const effectiveTotalPages = videosLinkToPage ? 1 : totalPages
    const currentPage = Math.min(Math.max(1, page), Math.max(1, effectiveTotalPages))
    return {
      pageItems: items.slice((currentPage - 1) * perPage, currentPage * perPage),
      currentPage,
      totalPages,
      effectiveTotalPages,
    }
  }

  const ITEMS = Array.from({ length: 25 }, (_, i) => i + 1)

  it('returns the first 9 items on page 1 with default perPage', () => {
    const { pageItems, currentPage } = paginate(ITEMS, 1, 9)
    expect(currentPage).toBe(1)
    expect(pageItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('returns the correct slice for page 2', () => {
    const { pageItems, currentPage } = paginate(ITEMS, 2, 9)
    expect(currentPage).toBe(2)
    expect(pageItems).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
  })

  it('returns the last partial slice on the final page', () => {
    const { pageItems, currentPage } = paginate(ITEMS, 3, 9)
    expect(currentPage).toBe(3)
    expect(pageItems).toEqual([19, 20, 21, 22, 23, 24, 25])
  })

  it('clamps currentPage to effectiveTotalPages when page exceeds range', () => {
    const { pageItems, currentPage } = paginate(ITEMS, 99, 9)
    expect(currentPage).toBe(3) // ceil(25/9) = 3
    expect(pageItems).toEqual([19, 20, 21, 22, 23, 24, 25])
  })

  it('returns page 1 when page is 0 or negative', () => {
    const { pageItems, currentPage } = paginate(ITEMS, 0, 9)
    expect(currentPage).toBe(1)
    expect(pageItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('returns all items on a single page when perPage >= items.length', () => {
    const { pageItems, totalPages } = paginate(ITEMS, 1, 100)
    expect(totalPages).toBe(1)
    expect(pageItems).toHaveLength(25)
  })

  it('returns empty array and page 1 when items list is empty', () => {
    const { pageItems, currentPage, totalPages } = paginate([], 1, 9)
    expect(pageItems).toEqual([])
    expect(currentPage).toBe(1)
    expect(totalPages).toBe(0)
  })

  it('when videosLinkToPage=true effectiveTotalPages is always 1', () => {
    const { effectiveTotalPages, pageItems } = paginate(ITEMS, 1, 9, true)
    expect(effectiveTotalPages).toBe(1)
    expect(pageItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('perPage of 1 produces totalPages equal to items length', () => {
    const { totalPages } = paginate(ITEMS, 1, 1)
    expect(totalPages).toBe(25)
  })

  it('treats perPage=0 as perPage=1 (Math.max guard)', () => {
    const { totalPages } = paginate(ITEMS, 1, 0)
    expect(totalPages).toBe(25)
  })

  it('returns correct totals for exactly divisible count', () => {
    const items = Array.from({ length: 18 }, (_, i) => i + 1)
    const { totalPages } = paginate(items, 1, 9)
    expect(totalPages).toBe(2)
  })
})

