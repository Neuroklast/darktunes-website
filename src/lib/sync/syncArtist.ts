/**
 * Artist Auto-Sync Service
 *
 * Orchestrates the full sync flow for a single artist:
 * 1. Fetches releases from iTunes (free, no key required).
 * 2. Scaffolds Spotify / Discogs / Songkick fetches (keys required;
 *    gracefully skipped when env vars are absent).
 * 3. Downloads cover-art images and uploads them to Cloudflare R2.
 * 4. Upserts releases and concerts into Supabase.
 * 5. Updates the artist's last_synced_at timestamp.
 *
 * All dependencies (db client, R2 upload function) are injected for
 * testability — no global singletons are imported here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { withExponentialBackoff, HttpError } from '@/lib/rateLimiter'

type DbClient = SupabaseClient<Database>
type ReleaseInsert = Database['public']['Tables']['releases']['Insert']
type ConcertInsert = Database['public']['Tables']['concerts']['Insert']

// ── External-API types ──────────────────────────────────────────────────────

export interface iTunesAlbum {
  collectionId: number
  collectionName: string
  artistName: string
  artworkUrl100: string
  artworkUrl600?: string
  releaseDate: string
  trackCount: number
  collectionViewUrl: string
  primaryGenreName: string
}

export interface iTunesSearchResponse {
  resultCount: number
  results: iTunesAlbum[]
}

export interface SongkickEvent {
  id: number
  displayName: string
  start: { date: string }
  venue?: { displayName?: string; city?: { displayName?: string; country?: { name?: string } } }
  uri?: string
}

// ── Dependency-injection contracts ─────────────────────────────────────────

/** Minimal fetch signature for DI (allows mocking in tests) */
export type FetchFn = (url: string) => Promise<Response>

/**
 * Uploads a buffer to R2 and returns the public URL.
 * Injected so tests never need a real S3 client.
 */
export type UploadToR2Fn = (params: {
  buffer: Buffer
  key: string
  mimeType: string
}) => Promise<string>

export interface SyncDeps {
  db: DbClient
  fetch: FetchFn
  uploadToR2: UploadToR2Fn
  /** Spotify client credentials token (optional – sync skipped when absent) */
  spotifyToken?: string
  /** Discogs consumer key (optional) */
  discogsKey?: string
  /** Songkick API key (optional) */
  songkickApiKey?: string
}

// ── Sync result ─────────────────────────────────────────────────────────────

export interface SyncResult {
  artistId: string
  releasesUpserted: number
  concertsUpserted: number
  imagesDownloaded: number
  errors: string[]
  skippedSources: string[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function releaseType(trackCount: number): 'album' | 'ep' | 'single' {
  if (trackCount === 1) return 'single'
  if (trackCount <= 6) return 'ep'
  return 'album'
}

/**
 * Downloads an image from a URL and uploads it to R2.
 * Returns the R2 public URL or the original URL on failure.
 */
async function cacheImageInR2(
  imageUrl: string,
  r2KeyPrefix: string,
  deps: Pick<SyncDeps, 'fetch' | 'uploadToR2'>,
): Promise<string> {
  try {
    const response = await deps.fetch(imageUrl)
    if (!response.ok) throw new HttpError(response.status, `Image fetch failed: ${response.status}`)

    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : 'jpg'
    const buffer = Buffer.from(await response.arrayBuffer())
    const key = `${r2KeyPrefix}.${ext}`

    return await deps.uploadToR2({ buffer, key, mimeType: contentType })
  } catch {
    // Fall back to the original URL rather than failing the entire sync
    return imageUrl
  }
}

// ── iTunes sync ─────────────────────────────────────────────────────────────

async function syncITunes(
  artist: { id: string; name: string },
  deps: SyncDeps,
  result: SyncResult,
): Promise<void> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist.name)}&entity=album&limit=200`

  const response = await withExponentialBackoff(
    async () => {
      const res = await deps.fetch(url)
      if (!res.ok) throw new HttpError(res.status, `iTunes API error: ${res.status}`)
      return res
    },
    { maxRetries: 3, initialDelayMs: 500 },
  )

  const json: iTunesSearchResponse = await response.json()
  const albums = json.results.filter(
    (r) => r.artistName.toLowerCase() === artist.name.toLowerCase(),
  )

  for (const album of albums) {
    const rawArtwork =
      album.artworkUrl600 ?? album.artworkUrl100.replace('100x100bb', '600x600bb')

    const coverArt = await cacheImageInR2(
      rawArtwork,
      `releases/itunes-${album.collectionId}`,
      deps,
    )
    if (coverArt !== rawArtwork) result.imagesDownloaded++

    const releaseData: ReleaseInsert = {
      title: album.collectionName,
      artist_id: artist.id,
      artist_name: album.artistName,
      release_date: album.releaseDate.split('T')[0],
      cover_art: coverArt,
      type: releaseType(album.trackCount),
      apple_music_url: album.collectionViewUrl,
      itunes_id: String(album.collectionId),
      featured: false,
    }

    const { error } = await deps.db
      .from('releases')
      .upsert(releaseData, { onConflict: 'itunes_id' })
    if (error) {
      result.errors.push(`iTunes upsert failed for "${album.collectionName}": ${error.message}`)
    } else {
      result.releasesUpserted++
    }
  }
}

// ── Songkick sync ────────────────────────────────────────────────────────────

async function syncSongkick(
  artist: { id: string; name: string; songkickId?: string | null },
  deps: SyncDeps,
  result: SyncResult,
): Promise<void> {
  if (!deps.songkickApiKey) {
    result.skippedSources.push('songkick')
    return
  }
  if (!artist.songkickId) {
    result.skippedSources.push('songkick (no artist ID)')
    return
  }

  const url = `https://api.songkick.com/api/3.0/artists/${artist.songkickId}/calendar.json?apikey=${deps.songkickApiKey}`

  const response = await withExponentialBackoff(
    async () => {
      const res = await deps.fetch(url)
      if (!res.ok) throw new HttpError(res.status, `Songkick API error: ${res.status}`)
      return res
    },
    { maxRetries: 3, initialDelayMs: 500 },
  )

  const json: { resultsPage?: { results?: { event?: SongkickEvent[] } } } = await response.json()
  const events = json.resultsPage?.results?.event ?? []

  for (const event of events) {
    const concertData: ConcertInsert = {
      artist_id: artist.id,
      artist_name: artist.name,
      event_name: event.displayName,
      venue_name: event.venue?.displayName ?? undefined,
      city: event.venue?.city?.displayName ?? undefined,
      country: event.venue?.city?.country?.name ?? undefined,
      event_date: event.start.date,
      ticket_url: event.uri ?? undefined,
      songkick_id: String(event.id),
      status: 'upcoming',
    }

    const { error } = await deps.db
      .from('concerts')
      .upsert(concertData, { onConflict: 'songkick_id' })
    if (error) {
      result.errors.push(`Songkick upsert failed for "${event.displayName}": ${error.message}`)
    } else {
      result.concertsUpserted++
    }
  }
}

// ── Spotify sync (scaffold – requires OAuth token) ──────────────────────────

async function syncSpotify(
  artist: { id: string; name: string; spotifyId?: string | null },
  deps: SyncDeps,
  result: SyncResult,
): Promise<void> {
  if (!deps.spotifyToken || !artist.spotifyId) {
    result.skippedSources.push('spotify')
    return
  }

  const url = `https://api.spotify.com/v1/artists/${artist.spotifyId}/albums?include_groups=album,single&limit=50`

  const response = await withExponentialBackoff(
    async () => {
      const res = await deps.fetch(url)
      if (!res.ok) throw new HttpError(res.status, `Spotify API error: ${res.status}`)
      return res
    },
    { maxRetries: 3, initialDelayMs: 500 },
  )

  // Minimal shape we need
  const json: { items?: { id: string; name: string; release_date: string; album_type: string; images?: { url: string; width: number }[] }[] } = await response.json()
  const albums = json.items ?? []

  for (const album of albums) {
    const coverSrc = album.images?.[0]?.url ?? ''
    const coverArt = coverSrc
      ? await cacheImageInR2(coverSrc, `releases/spotify-${album.id}`, deps)
      : ''
    if (coverArt && coverArt !== coverSrc) result.imagesDownloaded++

    const type = album.album_type === 'single' ? 'single' : album.album_type === 'ep' ? 'ep' : 'album'
    const releaseData: ReleaseInsert = {
      title: album.name,
      artist_id: artist.id,
      artist_name: artist.name,
      release_date: album.release_date,
      cover_art: coverArt || null,
      type,
      featured: false,
    }

    const { error } = await deps.db.from('releases').upsert(releaseData)
    if (error) {
      result.errors.push(`Spotify upsert failed for "${album.name}": ${error.message}`)
    } else {
      result.releasesUpserted++
    }
  }
}

// ── Main orchestrator ────────────────────────────────────────────────────────

export interface ArtistSyncInput {
  id: string
  name: string
  spotifyId?: string | null
  discogsId?: string | null
  songkickId?: string | null
}

/**
 * Runs the full sync pipeline for a single artist.
 * Errors from individual sources are collected (not thrown) so the
 * overall process never crashes.
 */
export async function syncArtist(
  artist: ArtistSyncInput,
  deps: SyncDeps,
): Promise<SyncResult> {
  const result: SyncResult = {
    artistId: artist.id,
    releasesUpserted: 0,
    concertsUpserted: 0,
    imagesDownloaded: 0,
    errors: [],
    skippedSources: [],
  }

  // Run each source independently; errors are captured, not re-thrown
  await Promise.allSettled([
    syncITunes(artist, deps, result).catch((err: unknown) => {
      result.errors.push(`iTunes sync error: ${err instanceof Error ? err.message : String(err)}`)
    }),
    syncSongkick(artist, deps, result).catch((err: unknown) => {
      result.errors.push(`Songkick sync error: ${err instanceof Error ? err.message : String(err)}`)
    }),
    syncSpotify(artist, deps, result).catch((err: unknown) => {
      result.errors.push(`Spotify sync error: ${err instanceof Error ? err.message : String(err)}`)
    }),
  ])

  // Update last_synced_at
  await deps.db
    .from('artists')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', artist.id)

  return result
}
