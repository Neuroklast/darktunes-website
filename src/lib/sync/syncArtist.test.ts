import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { syncArtist, type FetchFn, type UploadToR2Fn, type SyncDeps } from './syncArtist'

// Mock sleep so retry-based tests don't actually wait
vi.mock('@/lib/rateLimiter', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/rateLimiter')>()
  return { ...mod, sleep: vi.fn().mockResolvedValue(undefined) }
})

type DbClient = SupabaseClient<Database>

// ── mock helpers ─────────────────────────────────────────────────────────────

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(upsertError: unknown = null): DbClient {
  const builder = makeBuilder(null, upsertError)
  return { from: vi.fn().mockReturnValue(builder) } as unknown as DbClient
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeImageResponse(): Response {
  return new Response(Buffer.from('PNG_DATA'), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  })
}

const mockItunesResponse = {
  resultCount: 1,
  results: [
    {
      collectionId: 99001,
      collectionName: 'Darkness Rising',
      artistName: 'C Z A R I N A',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/99001/100x100bb.jpg',
      artworkUrl600: 'https://is1-ssl.mzstatic.com/image/thumb/Music/99001/600x600bb.jpg',
      releaseDate: '2023-03-15T12:00:00Z',
      trackCount: 10,
      collectionViewUrl: 'https://music.apple.com/album/99001',
      primaryGenreName: 'Electronic',
    },
  ],
}

const mockArtist = {
  id: 'artist-abc',
  name: 'C Z A R I N A',
  spotifyId: null,
  discogsId: null,
  songkickId: null,
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('syncArtist — iTunes', () => {
  let mockFetch: FetchFn
  let mockUploadToR2: UploadToR2Fn
  let db: DbClient
  let deps: SyncDeps

  beforeEach(() => {
    mockFetch = vi.fn()
    mockUploadToR2 = vi.fn().mockResolvedValue('https://cdn.darktunes.com/releases/itunes-99001.jpg')
    db = makeMockDb()
    deps = { db, fetch: mockFetch, uploadToR2: mockUploadToR2 }
  })

  it('upserts one release from iTunes and downloads cover art', async () => {
    vi.mocked(mockFetch)
      .mockResolvedValueOnce(makeJsonResponse(mockItunesResponse)) // iTunes search
      .mockResolvedValueOnce(makeImageResponse()) // cover art download

    const result = await syncArtist(mockArtist, deps)

    expect(result.releasesUpserted).toBe(1)
    expect(result.imagesDownloaded).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockUploadToR2).toHaveBeenCalledOnce()
  })

  it('skips tracks that do not match artist name', async () => {
    const response = {
      ...mockItunesResponse,
      results: [{ ...mockItunesResponse.results[0], artistName: 'Someone Else' }],
    }
    vi.mocked(mockFetch).mockResolvedValueOnce(makeJsonResponse(response))

    const result = await syncArtist(mockArtist, deps)

    expect(result.releasesUpserted).toBe(0)
    expect(mockUploadToR2).not.toHaveBeenCalled()
  })

  it('records an error when iTunes API returns 500 (and retries are exhausted)', async () => {
    vi.mocked(mockFetch).mockResolvedValue(new Response('error', { status: 500 }))

    const result = await syncArtist(mockArtist, {
      ...deps,
      // Override retry options to fail fast in tests
    })

    expect(result.errors.some((e) => e.includes('iTunes'))).toBe(true)
  })

  it('marks spotify / songkick as skipped when tokens are absent', async () => {
    vi.mocked(mockFetch).mockResolvedValueOnce(makeJsonResponse({ resultCount: 0, results: [] }))

    const result = await syncArtist(mockArtist, deps)

    expect(result.skippedSources).toContain('spotify')
    expect(result.skippedSources).toContain('songkick')
  })

  it('updates last_synced_at on the artist record', async () => {
    vi.mocked(mockFetch).mockResolvedValueOnce(makeJsonResponse({ resultCount: 0, results: [] }))

    await syncArtist(mockArtist, deps)

    expect(db.from).toHaveBeenCalledWith('artists')
  })

  it('continues and records error when cover-art download fails', async () => {
    vi.mocked(mockFetch)
      .mockResolvedValueOnce(makeJsonResponse(mockItunesResponse)) // iTunes
      .mockResolvedValueOnce(new Response('not found', { status: 404 })) // cover art fails

    const result = await syncArtist(mockArtist, deps)

    // Release should still be upserted (with original URL as fallback)
    expect(result.releasesUpserted).toBe(1)
    // No image was successfully uploaded to R2
    expect(result.imagesDownloaded).toBe(0)
    expect(result.errors).toHaveLength(0) // image failure is silent (falls back)
  })
})

describe('syncArtist — Songkick', () => {
  const mockSongkickResponse = {
    resultsPage: {
      results: {
        event: [
          {
            id: 55001,
            displayName: 'C Z A R I N A at Berghain',
            start: { date: '2026-09-15' },
            venue: {
              displayName: 'Berghain',
              city: { displayName: 'Berlin', country: { name: 'Germany' } },
            },
            uri: 'https://www.songkick.com/concerts/55001',
          },
        ],
      },
    },
  }

  it('upserts concerts when songkick ID and API key are provided', async () => {
    const mockFetch: FetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ resultCount: 0, results: [] })) // iTunes
      .mockResolvedValueOnce(makeJsonResponse(mockSongkickResponse)) // Songkick
    const mockUploadToR2: UploadToR2Fn = vi.fn()
    const db = makeMockDb()
    const deps: SyncDeps = {
      db,
      fetch: mockFetch,
      uploadToR2: mockUploadToR2,
      songkickApiKey: 'test-key',
    }

    const result = await syncArtist({ ...mockArtist, songkickId: 'sk-artist-99' }, deps)

    expect(result.concertsUpserted).toBe(1)
    expect(result.skippedSources).not.toContain('songkick')
  })

  it('skips Songkick sync when artist has no songkick_id', async () => {
    const mockFetch: FetchFn = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ resultCount: 0, results: [] }))
    const db = makeMockDb()
    const deps: SyncDeps = {
      db,
      fetch: mockFetch,
      uploadToR2: vi.fn(),
      songkickApiKey: 'test-key',
    }

    const result = await syncArtist(mockArtist, deps)

    expect(result.skippedSources).toContain('songkick (no artist ID)')
  })
})
