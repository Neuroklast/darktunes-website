export interface iTunesRelease {
  collectionId: number
  collectionName: string
  artistId: number
  artistName: string
  artworkUrl100: string
  artworkUrl600?: string
  releaseDate: string
  collectionType: string
  trackCount: number
  primaryGenreName: string
  collectionViewUrl: string
  wrapperType?: string
}

export interface iTunesSearchResponse {
  resultCount: number
  results: Array<{ artistId: number; artistName: string }>
}

export interface iTunesLookupResponse {
  resultCount: number
  results: iTunesRelease[]
}

function upgradeArtworkUrl(url: string): string {
  return url.replace(/\d+x\d+bb(\.\w+)$/, '3000x3000bb$1')
}

/** iTunes Lookup/Search page size (API maximum). */
export const ITUNES_LOOKUP_PAGE_SIZE = 200
/** Stop paging after this many collections so a single artist cannot burn the sync budget. */
export const ITUNES_COLLECTION_HARD_CAP = 1000

function mapCollectionResults(results: iTunesRelease[]): iTunesRelease[] {
  return results
    .filter((result) => result.wrapperType === 'collection')
    .map((result) => ({
      ...result,
      artworkUrl100: upgradeArtworkUrl(result.artworkUrl100),
      artworkUrl600: result.artworkUrl600
        ? upgradeArtworkUrl(result.artworkUrl600)
        : result.artworkUrl600,
    }))
}

async function lookupItunesCollections(
  artistId: string | number,
  fetchFn: typeof fetch,
): Promise<iTunesRelease[]> {
  const lookupResponse = await fetchFn(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(String(artistId))}&entity=album&limit=${ITUNES_LOOKUP_PAGE_SIZE}`,
  )
  if (!lookupResponse.ok) {
    throw new Error(`iTunes API error: ${lookupResponse.status}`)
  }
  const lookupData = (await lookupResponse.json()) as iTunesLookupResponse
  return mapCollectionResults(lookupData.results ?? [])
}

async function searchItunesCollectionPage(
  artistName: string,
  artistId: number,
  offset: number,
  fetchFn: typeof fetch,
): Promise<iTunesRelease[]> {
  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', artistName)
  url.searchParams.set('entity', 'album')
  url.searchParams.set('limit', String(ITUNES_LOOKUP_PAGE_SIZE))
  url.searchParams.set('offset', String(offset))

  const response = await fetchFn(url.toString())
  if (!response.ok) {
    throw new Error(`iTunes API error: ${response.status}`)
  }
  const data = (await response.json()) as iTunesLookupResponse
  return mapCollectionResults(data.results ?? []).filter((result) => result.artistId === artistId)
}

async function fetchAllItunesCollections(
  artistId: number,
  artistName: string,
  fetchFn: typeof fetch,
): Promise<iTunesRelease[]> {
  const firstPage = await lookupItunesCollections(artistId, fetchFn)
  if (firstPage.length < ITUNES_LOOKUP_PAGE_SIZE) return firstPage

  const byId = new Map<number, iTunesRelease>()
  for (const release of firstPage) byId.set(release.collectionId, release)

  let offset = ITUNES_LOOKUP_PAGE_SIZE
  while (byId.size < ITUNES_COLLECTION_HARD_CAP) {
    const page = await searchItunesCollectionPage(artistName, artistId, offset, fetchFn)
    for (const release of page) byId.set(release.collectionId, release)
    if (page.length < ITUNES_LOOKUP_PAGE_SIZE) break
    offset += ITUNES_LOOKUP_PAGE_SIZE
  }

  return [...byId.values()]
}

function pickItunesArtistMatch(
  results: Array<{ artistId: number; artistName: string }>,
  artistName: string,
): { artistId: number; artistName: string } | undefined {
  const needle = (artistName ?? '').trim().toLowerCase()
  if (!needle) return results[0]
  return (
    results.find((result) => result.artistName?.toLowerCase() === needle) ?? results[0]
  )
}

export async function searchItunesArtist(
  artistName: string,
  fetchFn: typeof fetch = globalThis.fetch,
  /** When provided, skip the name-search step and look up this iTunes artist ID directly.
   *  This prevents fetching the wrong artist when multiple artists share the same name. */
  itunesArtistId?: string,
): Promise<iTunesRelease[]> {
  if (itunesArtistId) {
    const numericId = Number(itunesArtistId)
    if (!Number.isFinite(numericId)) {
      return lookupItunesCollections(itunesArtistId, fetchFn)
    }
    return fetchAllItunesCollections(numericId, artistName, fetchFn)
  }

  const encodedArtist = encodeURIComponent(artistName)
  const searchResponse = await fetchFn(
    `https://itunes.apple.com/search?term=${encodedArtist}&entity=musicArtist&attribute=artistTerm&limit=5`,
  )

  if (!searchResponse.ok) {
    throw new Error(`iTunes API error: ${searchResponse.status}`)
  }

  const searchData = (await searchResponse.json()) as iTunesSearchResponse
  const artistMatch = pickItunesArtistMatch(searchData.results ?? [], artistName)

  if (!artistMatch?.artistId) return []

  return fetchAllItunesCollections(artistMatch.artistId, artistName, fetchFn)
}

export async function getAllArtistsReleases(artistNames: string[]): Promise<Map<string, iTunesRelease[]>> {
  const releasesMap = new Map<string, iTunesRelease[]>()
  
  const fetchPromises = artistNames.map(async (artistName) => {
    const releases = await searchItunesArtist(artistName)
    return { artistName, releases }
  })
  
  const results = await Promise.all(fetchPromises)
  
  results.forEach(({ artistName, releases }) => {
    if (releases.length > 0) {
      releasesMap.set(artistName, releases)
    }
  })
  
  return releasesMap
}

export function convertItunesReleaseToRelease(itunesRelease: iTunesRelease): {
  id: string
  title: string
  artistId: string
  artistName: string
  releaseDate: string
  coverArt: string
  type: 'album' | 'ep' | 'single'
  appleMusicUrl: string
  featured: boolean
} {
  const type = itunesRelease.trackCount === 1 
    ? 'single' 
    : itunesRelease.trackCount <= 6 
      ? 'ep' 
      : 'album'
  
  return {
    id: String(itunesRelease.collectionId),
    title: itunesRelease.collectionName,
    artistId: String(itunesRelease.artistId),
    artistName: itunesRelease.artistName,
    releaseDate: itunesRelease.releaseDate.split('T')[0],
    coverArt: upgradeArtworkUrl(itunesRelease.artworkUrl100),
    type,
    appleMusicUrl: itunesRelease.collectionViewUrl,
    featured: false
  }
}
