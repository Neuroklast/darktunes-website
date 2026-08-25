/**
 * src/lib/sync/syncArtist.ts
 *
 * Core artist sync orchestrator following the Inversion of Control (IoC) pattern.
 * All external dependencies are injected via SyncDeps — making this fully testable
 * without any real HTTP calls or R2 uploads.
 *
 * Flow:
 *   1. Fetch artist row from DB
 *   2. Fetch releases from iTunes API (with exponential backoff)
 *   3. For each release (parallel, concurrency 5): upsert/merge to DB → cache cover art in R2 → update cover_art
 *   4. Update artist's last_synced_at timestamp
 *   5. Write a sync_log entry (success / partial / error) unless skipSyncLog is set
 *   6. Return SyncResult — never throws; all errors are captured in SyncResult.errors
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ITUNES_COLLECTION_HARD_CAP, searchItunesArtist } from '@/lib/itunesApi'
import { cacheReleaseCoverArt } from '@/lib/sync/coverArtUpload'
import { syncReleaseFromExternalSource } from '@/lib/api/releases'
import { mapWithConcurrency } from '@/lib/mapWithConcurrency'
import { withApiRetry } from '@/lib/sync/retryPolicy'
import { stripReleaseSuffix, type CrossSourceReleaseRow } from '@/lib/sync/deduplication'

/** Keep low: each release hits iTunes CDN + R2 (DNS-sensitive on Vercel). */
const RELEASE_SYNC_CONCURRENCY = 2

/** Serialises merge/upsert so parallel workers share one consistent in-memory release list. */
let releaseSyncLock: Promise<void> = Promise.resolve()

async function withReleaseSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = releaseSyncLock.then(fn)
  releaseSyncLock = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export interface SyncDeps {
  /** Supabase client with service-role access for writes */
  db: SupabaseClient<Database>
  /** Injectable fetch — real in production, mocked in tests */
  fetch: typeof fetch
  /**
   * Uploads an image from `imageUrl` to R2 and returns the public CDN URL.
   * Receives a `keyPrefix` (e.g. 'cover-art') to organise objects in the bucket.
   */
  uploadToR2: (imageUrl: string, keyPrefix: string) => Promise<string>
  /** When true, skips the per-artist sync_logs insert (used when called from syncAll). */
  skipSyncLog?: boolean
}

export interface SyncResult {
  artistId: string
  releasesUpserted: number
  errors: string[]
}

interface ReleaseProcessOutcome {
  upserted: boolean
  merged: boolean
  errors: string[]
}

function deriveReleaseType(trackCount: number): 'single' | 'ep' | 'album' {
  if (trackCount === 1) return 'single'
  if (trackCount <= 6) return 'ep'
  return 'album'
}

/**
 * Extracts the numeric iTunes artist ID from an Apple Music URL.
 * e.g. "https://music.apple.com/us/artist/name/1234567890" → "1234567890"
 * Returns null when the URL is not an Apple Music artist URL.
 */
function extractItunesArtistId(appleMusicUrl: string | null | undefined): string | null {
  if (!appleMusicUrl) return null
  const match = appleMusicUrl.match(/\/artist\/[^/]+\/(\d+)(?:[?#].*)?$/)
  return match?.[1] ?? null
}

async function processItunesRelease(
  release: Awaited<ReturnType<typeof searchItunesArtist>>[number],
  artistId: string,
  deps: SyncDeps,
  existingReleases: CrossSourceReleaseRow[],
): Promise<ReleaseProcessOutcome> {
  const { db, uploadToR2 } = deps
  const releaseErrors: string[] = []
  const artworkUrl = release.artworkUrl600 ?? release.artworkUrl100
  const releaseDate = release.releaseDate.split('T')[0]
  const itunesId = String(release.collectionId)

  try {
    const { release: upsertedRelease, merged } = await withReleaseSyncLock(() =>
      syncReleaseFromExternalSource(
        db,
        'itunes',
        {
          title: stripReleaseSuffix(release.collectionName),
          artist_id: artistId,
          release_date: releaseDate,
          cover_art: artworkUrl ?? null,
          type: deriveReleaseType(release.trackCount),
          apple_music_url: release.collectionViewUrl,
          itunes_id: itunesId,
          featured: false,
        },
        existingReleases,
      ),
    )

    await cacheReleaseCoverArt(
      db,
      uploadToR2,
      upsertedRelease.id,
      release.collectionName,
      artworkUrl,
      releaseErrors,
      upsertedRelease.coverArt,
    )

    return { upserted: true, merged, errors: releaseErrors }
  } catch (err) {
    return {
      upserted: false,
      merged: false,
      errors: [
        `Failed to upsert "${release.collectionName}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      ],
    }
  }
}

/**
 * Syncs one artist: fetches releases from iTunes, caches cover art in R2,
 * upserts releases to Supabase, and writes a sync_logs entry.
 *
 * This function never throws — errors are captured and returned in SyncResult.
 */
export async function syncArtist(artistId: string, deps: SyncDeps): Promise<SyncResult> {
  const startedAt = Date.now()
  const { db, fetch: fetchFn, skipSyncLog } = deps
  const errors: string[] = []
  let releasesUpserted = 0
  let releasesMerged = 0

  // 1. Fetch artist from DB
  const { data: artistRow, error: artistErr } = await db
    .from('artists')
    .select('id, name, apple_music_url')
    .eq('id', artistId)
    .single()

  if (artistErr || !artistRow) {
    const msg = artistErr?.message ?? 'Artist not found'
    return { artistId, releasesUpserted: 0, errors: [msg] }
  }

  const itunesArtistId = extractItunesArtistId(artistRow.apple_music_url)

  const { data: existingReleaseRows } = await db
    .from('releases')
    .select('id, title, release_date, spotify_id, itunes_id, discogs_id, isrc, barcode, sync_policy')
    .eq('artist_id', artistId)

  const existingReleases: CrossSourceReleaseRow[] = (existingReleaseRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    release_date: row.release_date,
    spotify_id: row.spotify_id,
    itunes_id: row.itunes_id,
    discogs_id: row.discogs_id,
    isrc: row.isrc,
    barcode: row.barcode,
    sync_policy: row.sync_policy ?? 'auto',
  }))

  // 2. Fetch iTunes releases with exponential backoff
  let itunesReleases: Awaited<ReturnType<typeof searchItunesArtist>> = []
  try {
    itunesReleases = await withApiRetry('itunes', () =>
      searchItunesArtist(artistRow.name, fetchFn, itunesArtistId ?? undefined),
    )
  } catch (err) {
    errors.push(`iTunes fetch failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 3. Process releases in parallel (bounded concurrency)
  const outcomes = await mapWithConcurrency(
    itunesReleases,
    RELEASE_SYNC_CONCURRENCY,
    (release) => processItunesRelease(release, artistId, deps, existingReleases),
  )

  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
      errors.push(`Release processing failed: ${String(outcome.reason)}`)
      continue
    }
    errors.push(...outcome.value.errors)
    if (outcome.value.upserted) releasesUpserted++
    if (outcome.value.merged) releasesMerged++
  }

  // 4. Update artist's last_synced_at (best-effort, ignore errors)
  await db
    .from('artists')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', artistId)

  const itunesTruncated = itunesReleases.length >= ITUNES_COLLECTION_HARD_CAP
  if (itunesTruncated) {
    errors.push(
      `iTunes catalog truncated at ${ITUNES_COLLECTION_HARD_CAP} collections — catalog may be incomplete`,
    )
  }

  // 5. Write sync_log entry (skipped when syncAll writes an aggregate log)
  if (!skipSyncLog) {
    const coverFailures = errors.filter((e) => e.includes('Cover art upload failed')).length
    const status: 'success' | 'partial' | 'error' =
      errors.length === 0 ? 'success' : releasesUpserted > 0 ? 'partial' : 'error'

    await db.from('sync_logs').insert({
      artist_id: artistId,
      status,
      message: errors[0] ?? null,
      releases_synced: releasesUpserted,
      errors,
      api_source: 'itunes',
      duration_ms: Date.now() - startedAt,
      metadata: {
        source: 'itunes',
        releases_found: itunesReleases.length,
        releases_merged: releasesMerged,
        cover_failures: coverFailures,
        itunes_truncated: itunesTruncated,
        concurrency: RELEASE_SYNC_CONCURRENCY,
      },
    })
  }

  return { artistId, releasesUpserted, errors }
}