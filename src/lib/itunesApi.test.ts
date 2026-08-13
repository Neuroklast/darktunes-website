import { describe, expect, it, vi } from 'vitest'
import { searchItunesArtist } from './itunesApi'

describe('searchItunesArtist', () => {
  it('resolves artist ID first, then fetches collections and upgrades artwork URLs', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [{ artistId: 42, artistName: 'Dark Artist' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 2,
          results: [
            {
              wrapperType: 'artist',
              artistId: 42,
              artistName: 'Dark Artist',
            },
            {
              wrapperType: 'collection',
              collectionId: 99,
              collectionName: 'Black Sun',
              artistId: 42,
              artistName: 'Dark Artist',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/100x100bb.jpg',
              releaseDate: '2026-01-01T00:00:00Z',
              collectionType: 'Album',
              trackCount: 10,
              primaryGenreName: 'Industrial',
              collectionViewUrl: 'https://music.apple.com/album/99',
            },
          ],
        }),
      } as Response)

    const releases = await searchItunesArtist('Dark Artist', fetchFn)

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      'https://itunes.apple.com/search?term=Dark%20Artist&entity=musicArtist&attribute=artistTerm&limit=5',
    )
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'https://itunes.apple.com/lookup?id=42&entity=album&limit=200',
    )
    expect(releases).toHaveLength(1)
    expect(releases[0].artworkUrl100).toContain('3000x3000bb.jpg')
  })

  it('falls back to the first search hit when no exact artist name matches', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [{ artistId: 99, artistName: 'Dark Artist Official' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 2,
          results: [
            { wrapperType: 'artist', artistId: 99, artistName: 'Dark Artist Official' },
            {
              wrapperType: 'collection',
              collectionId: 7,
              collectionName: 'Fallback LP',
              artistId: 99,
              artistName: 'Dark Artist Official',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/100x100bb.jpg',
              releaseDate: '2026-01-01T00:00:00Z',
              collectionType: 'Album',
              trackCount: 8,
              primaryGenreName: 'Industrial',
              collectionViewUrl: 'https://music.apple.com/album/7',
            },
          ],
        }),
      } as Response)

    const releases = await searchItunesArtist('Dark Artist', fetchFn)

    expect(releases).toHaveLength(1)
    expect(releases[0].collectionId).toBe(7)
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'https://itunes.apple.com/lookup?id=99&entity=album&limit=200',
    )
  })

  it('pages the Search API when lookup returns a full 200-collection page', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      wrapperType: 'collection' as const,
      collectionId: i + 1,
      collectionName: `Album ${i + 1}`,
      artistId: 42,
      artistName: 'Dark Artist',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/100x100bb.jpg',
      releaseDate: '2026-01-01T00:00:00Z',
      collectionType: 'Album',
      trackCount: 10,
      primaryGenreName: 'Industrial',
      collectionViewUrl: `https://music.apple.com/album/${i + 1}`,
    }))

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ resultCount: 201, results: [{ wrapperType: 'artist' }, ...fullPage] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              wrapperType: 'collection',
              collectionId: 201,
              collectionName: 'Album 201',
              artistId: 42,
              artistName: 'Dark Artist',
              artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/100x100bb.jpg',
              releaseDate: '2026-02-01T00:00:00Z',
              collectionType: 'Album',
              trackCount: 9,
              primaryGenreName: 'Industrial',
              collectionViewUrl: 'https://music.apple.com/album/201',
            },
          ],
        }),
      } as Response)

    const releases = await searchItunesArtist('Dark Artist', fetchFn, '42')

    expect(releases).toHaveLength(201)
    expect(releases.map((r) => r.collectionId)).toContain(201)
    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      'https://itunes.apple.com/lookup?id=42&entity=album&limit=200',
    )
    expect(String(fetchFn.mock.calls[1]?.[0])).toContain('offset=200')
    expect(String(fetchFn.mock.calls[1]?.[0])).toContain('entity=album')
  })
})
