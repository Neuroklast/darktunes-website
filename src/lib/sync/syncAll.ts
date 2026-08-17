/**
 * src/lib/sync/syncAll.ts
 *
 * Multi-artist, multi-API sync orchestrator.
 *
 * Orchestrates a full synchronisation run across all artists in the database:
 *   1. iTunes (existing)
 *   2. Spotify — albums + popularity + cover art
 *   3. Discogs — physical releases (catalog numbers, barcodes)
 *   4. Songkick — upcoming concerts
 *   5. Bandsintown — upcoming concerts (second source)
 *   6. Odesli — smart links for newly synced releases
 *
 * All dependencies are injected via `SyncAllDeps` for full testability.
 * The function never throws — all errors are collected in `SyncAllResult`.
 *
 * This is designed to be called from:
 *   - app/api/sync/route.ts  (manual trigger from Admin)
 *   - Supabase Edge Function / pg_cron (scheduled)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getArtistPrivateByArtistIds } from '@/lib/api/artistPrivateData'
import { syncReleaseFromExternalSource } from '@/lib/api/releases'
import { fetchSpotifyArtistReleases } from './spotifyApi'
import { fetchDiscogsArtistReleases } from './discogsApi'
import { fetchSongkickArtistCalendar } from './songkickApi'
import { fetchBandsintownArtistEvents } from './bandsintownApi'
import { isSkippableOdesliError, pickOdesliMusicUrl } from './odesliApi'
import { resolveOdesliSmartLinkThrottled } from './odesliThrottle'
import { deduplicateReleases, pruneOrphanedDuplicates, type CrossSourceReleaseRow } from './deduplication'
import { isRateLimitedSyncError, withApiRetry } from './retryPolicy'
import { cacheReleaseCoverArt } from './coverArtUpload'
import { syncArtist } from './syncArtist'
import type { SyncDeps } from './syncArtist'

/** Releases (or artists) resolved per Odesli queue job invocation. */
export const ODESLI_BATCH_SIZE = 40

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncAllDeps extends SyncDeps {
  /** Spotify client credentials — undefined means Spotify sync is skipped */
  spotify?: { clientId: string; clientSecret: string }
  /** Discogs personal access token — undefined means Discogs sync is skipped */
  discogsToken?: string
  /** Songkick API key — undefined means Songkick sync is skipped */
  songkickApiKey?: string
  /** Bandsintown API key — undefined means Bandsintown sync is skipped */
  bandsintownApiKey?: string
  /**
   * When set, only the sync step for this API source is executed.
   * Useful for per-API force-sync from the admin health widget.
   */
  onlyApi?: string
  /**
   * When set, only this single artist is fetched and processed.
   * Used by the queue executor so each job processes exactly one artist.
   */
  onlyArtistId?: string
  /** Max releases to resolve per Odesli batch (queue executor). */
  odesliBatchLimit?: number
}

export interface ApiSyncResult {
  api: string
  artistsProcessed: number
  releasesUpserted: number
  concertsUpserted: number
  rateLimited: boolean
  /** True when more Odesli work remains after a batch (re-queue). */
  hasMoreWork?: boolean
  errors: string[]
}

export interface SyncAllResult {
  results: ApiSyncResult[]
  totalErrors: number
}

// ---------------------------------------------------------------------------
// Core orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs a full synchronisation across all artists and all configured APIs.
 * Returns a consolidated result — never throws.
 */
const EXISTING_RELEASES_SELECT =
  'id, title, release_date, spotify_id, itunes_id, discogs_id, isrc, barcode, sync_policy' as const

function mapExistingReleaseRow(row: {
  id: string
  title: string
  release_date: string
  spotify_id: string | null
  itunes_id: string | null
  discogs_id: string | null
  isrc: string | null
  barcode: string | null
  sync_policy?: 'auto' | 'manual_until_street' | 'locked' | null
}): CrossSourceReleaseRow {
  return {
    id: row.id,
    title: row.title,
    release_date: row.release_date,
    spotify_id: row.spotify_id,
    itunes_id: row.itunes_id,
    discogs_id: row.discogs_id,
    isrc: row.isrc,
    barcode: row.barcode,
    sync_policy: row.sync_policy ?? 'auto',
  }
}

/**
 * Loads all releases that should be considered when de-duplicating incoming
 * sync data for a given artist:
 *   1. Releases whose legacy `artist_id` column points to this artist.
 *   2. Releases linked via the many-to-many `release_artists` junction table
 *      (featurings / collaborations created through the admin UI).
 *
 * Including junction-table releases lets `findCrossSourceMergeTarget` detect
 * cross-artist duplicates on the fuzzy-match path without an extra per-release
 * DB round-trip.
 */
async function loadArtistExistingReleases(
  db: SupabaseClient<Database>,
  artistId: string,
): Promise<CrossSourceReleaseRow[]> {
  const { data, error } = await db
    .from('releases')
    .select(EXISTING_RELEASES_SELECT)
    .eq('artist_id', artistId)

  if (error) throw new Error(error.message)

  const rows = (data ?? []).map(mapExistingReleaseRow)
  const seenIds = new Set(rows.map((r) => r.id))

  // Include releases linked via the release_artists junction table (credited
  // featurings / collaborations) so the in-memory list is complete.
  const { data: junctionRows } = await (db as SupabaseClient<Database>)
    .from('release_artists' as never)
    .select('release_id')
    .eq('artist_id', artistId)

  const extraIds = ((junctionRows ?? []) as { release_id: string }[])
    .map((r) => r.release_id)
    .filter((id) => id && !seenIds.has(id))

  if (extraIds.length > 0) {
    const { data: extra } = await db
      .from('releases')
      .select(EXISTING_RELEASES_SELECT)
      .in('id', extraIds)

    for (const row of extra ?? []) {
      if (!seenIds.has(row.id)) {
        rows.push(mapExistingReleaseRow(row))
        seenIds.add(row.id)
      }
    }
  }

  return rows
}

export async function syncAll(deps: SyncAllDeps): Promise<SyncAllResult> {
  const {
    db,
    fetch: fetchFn,
    uploadToR2,
    spotify,
    discogsToken,
    songkickApiKey,
    bandsintownApiKey,
    onlyApi,
    onlyArtistId,
    odesliBatchLimit = ODESLI_BATCH_SIZE,
  } = deps
  const results: ApiSyncResult[] = []

  // 1. Fetch artists — either all or just the one targeted by the queue job
  const artistQuery = db.from('artists').select('*')
  const { data: artists, error: artistsErr } = onlyArtistId
    ? await artistQuery.eq('id', onlyArtistId)
    : await artistQuery
  if (artistsErr || !artists) {
    return {
      results: [
        {
          api: 'all',
          artistsProcessed: 0,
          releasesUpserted: 0,
          concertsUpserted: 0,
          rateLimited: false,
          errors: [artistsErr?.message ?? 'Failed to fetch artists'],
        },
      ],
      totalErrors: 1,
    }
  }

  // Per-artist Bandsintown keys live in artist_private_data after the public
  // column was nulled. Overlay them so eligibility + fetch use the real key.
  try {
    const privateByArtistId = await getArtistPrivateByArtistIds(
      db,
      artists.map((artist) => artist.id),
    )
    for (const artist of artists) {
      const privateKey = privateByArtistId.get(artist.id)?.bandsintown_api_key
      if (privateKey) artist.bandsintown_api_key = privateKey
    }
  } catch {
    // Keep public-column fallback if the private table cannot be read.
  }

  // 2. iTunes sync (existing pipeline) — parallelised per artist with
  // Promise.allSettled so one failed artist does not block the others.
  if (!onlyApi || onlyApi === 'itunes') {
    const itunesStartedAt = Date.now()
    const itunesResult: ApiSyncResult = {
      api: 'itunes',
      artistsProcessed: 0,
      releasesUpserted: 0,
      concertsUpserted: 0,
      rateLimited: false,
      errors: [],
    }
    const itunesOutcomes = await Promise.allSettled(
      artists.map((artist) =>
        syncArtist(artist.id, { db, fetch: fetchFn, uploadToR2, skipSyncLog: true }),
      ),
    )
    for (const outcome of itunesOutcomes) {
      itunesResult.artistsProcessed++
      if (outcome.status === 'fulfilled') {
        itunesResult.releasesUpserted += outcome.value.releasesUpserted
        itunesResult.errors.push(...outcome.value.errors)
      } else {
        itunesResult.errors.push(`iTunes sync failed: ${String(outcome.reason)}`)
      }
    }
    await writeSyncLog(db, 'itunes', itunesResult, {
      durationMs: Date.now() - itunesStartedAt,
      artistId: onlyArtistId ?? null,
      metadata: {
        source: 'itunes',
        artists_processed: itunesResult.artistsProcessed,
        only_artist_id: onlyArtistId ?? null,
      },
    })
    results.push(itunesResult)
  }

  // 3. Spotify sync
  if ((!onlyApi || onlyApi === 'spotify') && spotify) {
    const spotifyStartedAt = Date.now()
    const spotifyResult: ApiSyncResult = {
      api: 'spotify',
      artistsProcessed: 0,
      releasesUpserted: 0,
      concertsUpserted: 0,
      rateLimited: false,
      errors: [],
    }

    for (const artist of artists) {
      if (!artist.spotify_id) continue
      spotifyResult.artistsProcessed++

      try {
        const existingReleases = await loadArtistExistingReleases(db, artist.id)

        const spotifyReleases = await withApiRetry('spotify', () =>
          fetchSpotifyArtistReleases(
            artist.spotify_id!,
            spotify.clientId,
            spotify.clientSecret,
            fetchFn,
          ),
        )

        const discogsReleases = discogsToken && artist.discogs_id
          ? await withApiRetry('discogs', () =>
              fetchDiscogsArtistReleases(artist.discogs_id!, discogsToken, fetchFn),
            ).catch((e) => {
              spotifyResult.errors.push(`Discogs fetch for ${artist.name}: ${String(e)}`)
              return []
            })
          : []

        const merged = deduplicateReleases(spotifyReleases, discogsReleases).filter(
          (release) => release.spotifyId,
        )

        for (const release of merged) {
          try {
            const { release: upsertedRelease } = await syncReleaseFromExternalSource(
              db,
              'spotify',
              {
                title: release.title,
                artist_id: artist.id,
                release_date: release.releaseDate,
                cover_art: release.coverUrl,
                type: release.type,
                spotify_url: release.spotifyUrl,
                spotify_id: release.spotifyId,
                discogs_id: release.discogsId,
                isrc: release.isrc,
                barcode: release.barcode,
                catalog_number: release.catalogNumber,
                popularity: release.popularity,
                featured: false,
              },
              existingReleases,
            )

            if (upsertedRelease.id) {
              await cacheReleaseCoverArt(
                db,
                uploadToR2,
                upsertedRelease.id,
                release.title,
                release.coverUrl ?? undefined,
                spotifyResult.errors,
                upsertedRelease.coverArt,
              )
            }

            spotifyResult.releasesUpserted++
          } catch (e) {
            spotifyResult.errors.push(
              `Failed to upsert "${release.title}" for ${artist.name}: ${String(e)}`,
            )
          }
        }

        // Best-effort: collapse any pre-existing DB duplicates for this artist.
        try {
          await pruneOrphanedDuplicates(db, artist.id, existingReleases)
        } catch (e) {
          spotifyResult.errors.push(`Prune duplicates for ${artist.name}: ${String(e)}`)
        }
      } catch (e) {
        const msg = String(e)
        if (isRateLimitedSyncError(e)) spotifyResult.rateLimited = true
        spotifyResult.errors.push(`Spotify sync for ${artist.name}: ${msg}`)
      }
    }

    await writeSyncLog(db, 'spotify', spotifyResult, {
      durationMs: Date.now() - spotifyStartedAt,
      artistId: onlyArtistId ?? null,
    })
    results.push(spotifyResult)
  }

  // 3.5. Standalone Discogs sync — runs independently of Spotify
  // Syncs releases for artists that have a discogs_id but may not have been
  // covered by the Spotify block (or when Spotify is not configured).
  if ((!onlyApi || onlyApi === 'discogs') && discogsToken) {
    const discogsStartedAt = Date.now()
    const discogsResult: ApiSyncResult = {
      api: 'discogs',
      artistsProcessed: 0,
      releasesUpserted: 0,
      concertsUpserted: 0,
      rateLimited: false,
      errors: [],
    }

    for (const artist of artists) {
      if (!artist.discogs_id) continue
      discogsResult.artistsProcessed++

      try {
        const existingReleases = await loadArtistExistingReleases(db, artist.id)

        const discogsReleases = await withApiRetry('discogs', () =>
          fetchDiscogsArtistReleases(artist.discogs_id!, discogsToken, fetchFn),
        )

        for (const release of discogsReleases) {
          try {
            const { data: existing } = await db
              .from('releases')
              .select('id, spotify_id')
              .eq('discogs_id', release.discogsId)
              .maybeSingle()

            if (existing?.spotify_id) continue

            const { release: upsertedRelease } = await syncReleaseFromExternalSource(
              db,
              'discogs',
              {
                title: release.title,
                artist_id: artist.id,
                release_date: release.releaseDate ?? new Date().toISOString().slice(0, 10),
                cover_art: release.coverUrl,
                type: release.format === 'vinyl' || release.format === 'cd' ? 'album' : 'single',
                discogs_id: release.discogsId,
                barcode: release.barcode,
                catalog_number: release.catalogNumber,
                featured: false,
              },
              existingReleases,
            )

            if (upsertedRelease.id) {
              await cacheReleaseCoverArt(
                db,
                uploadToR2,
                upsertedRelease.id,
                release.title,
                release.coverUrl ?? undefined,
                discogsResult.errors,
                upsertedRelease.coverArt,
              )
            }

            discogsResult.releasesUpserted++
          } catch (e) {
            discogsResult.errors.push(
              `Failed to upsert Discogs release "${release.title}" for ${artist.name}: ${String(e)}`,
            )
          }
        }

        // Best-effort: collapse any pre-existing DB duplicates for this artist.
        try {
          await pruneOrphanedDuplicates(db, artist.id, existingReleases)
        } catch (e) {
          discogsResult.errors.push(`Prune duplicates for ${artist.name}: ${String(e)}`)
        }
      } catch (e) {
        const msg = String(e)
        if (isRateLimitedSyncError(e)) discogsResult.rateLimited = true
        discogsResult.errors.push(`Discogs sync for ${artist.name}: ${msg}`)
      }
    }

    await writeSyncLog(db, 'discogs', discogsResult, {
      durationMs: Date.now() - discogsStartedAt,
      artistId: onlyArtistId ?? null,
      metadata: { source: 'discogs', only_artist_id: onlyArtistId ?? null },
    })
    results.push(discogsResult)
  }

  // 4. Songkick sync
  if ((!onlyApi || onlyApi === 'songkick') && songkickApiKey) {
    const songkickStartedAt = Date.now()
    const songkickResult: ApiSyncResult = {
      api: 'songkick',
      artistsProcessed: 0,
      releasesUpserted: 0,
      concertsUpserted: 0,
      rateLimited: false,
      errors: [],
    }

    for (const artist of artists) {
      if (!artist.songkick_id) continue
      songkickResult.artistsProcessed++

      try {
        const concerts = await withApiRetry('songkick', () =>
          fetchSongkickArtistCalendar(artist.songkick_id!, songkickApiKey, fetchFn),
        )

        if (concerts.length > 0) {
          const concertsData = concerts.map((concert) => ({
            artist_id: artist.id,
            event_name: concert.eventName,
            venue_name: concert.venueName,
            venue_city: concert.venueCity,
            venue_country: concert.venueCountry,
            concert_date: concert.concertDate,
            ticket_url: concert.ticketUrl,
            songkick_id: concert.songkickId,
            status: concert.status,
          }))

          try {
            await db.from('concerts').upsert(concertsData, { onConflict: 'songkick_id' })

            songkickResult.concertsUpserted += concerts.length
          } catch (e) {
            songkickResult.errors.push(
              `Failed to bulk upsert ${concerts.length} concerts for artist "${artist.name}": ${String(e)}`,
            )
          }
        }
      } catch (e) {
        const msg = String(e)
        if (isRateLimitedSyncError(e)) songkickResult.rateLimited = true
        songkickResult.errors.push(`Songkick sync for ${artist.name}: ${msg}`)
      }
    }

    await writeSyncLog(db, 'songkick', songkickResult, {
      durationMs: Date.now() - songkickStartedAt,
      artistId: onlyArtistId ?? null,
      metadata: { source: 'songkick', only_artist_id: onlyArtistId ?? null },
    })
    results.push(songkickResult)
  }

  // 5. Bandsintown sync — upcoming concerts (second source)
  // Run the Bandsintown block if: the API is requested AND at least one of these is true:
  //   - a global bandsintownApiKey was provided (used as fallback)
  //   - at least one artist has a per-artist bandsintown_api_key set
  const hasBandsintownKey = !!bandsintownApiKey || artists.some((a) => !!a.bandsintown_api_key)
  if ((!onlyApi || onlyApi === 'bandsintown') && hasBandsintownKey) {
    const bandsintownStartedAt = Date.now()
    const bandsintownResult: ApiSyncResult = {
      api: 'bandsintown',
      artistsProcessed: 0,
      releasesUpserted: 0,
      concertsUpserted: 0,
      rateLimited: false,
      errors: [],
    }

    for (const artist of artists) {
      if (!artist.bandsintown_id) continue
      // Use per-artist key first, then fall back to global key
      const effectiveKey = artist.bandsintown_api_key ?? bandsintownApiKey
      if (!effectiveKey) continue
      bandsintownResult.artistsProcessed++

      try {
        const concerts = await withApiRetry('bandsintown', () =>
          fetchBandsintownArtistEvents(artist.bandsintown_id!, effectiveKey, fetchFn),
        )

        if (concerts.length > 0) {
          const concertsData = concerts.map((concert) => ({
            artist_id: artist.id,
            event_name: concert.eventName,
            venue_name: concert.venueName,
            venue_city: concert.venueCity,
            venue_country: concert.venueCountry,
            concert_date: concert.concertDate,
            ticket_url: concert.ticketUrl,
            bandsintown_id: concert.bandsintownId,
            status: concert.status,
          }))

          try {
            await db.from('concerts').upsert(concertsData, { onConflict: 'bandsintown_id' })

            bandsintownResult.concertsUpserted += concerts.length
          } catch (e) {
            bandsintownResult.errors.push(
              `Failed to bulk upsert ${concerts.length} concerts for artist "${artist.name}": ${String(e)}`,
            )
          }
        }
      } catch (e) {
        const msg = String(e)
        if (isRateLimitedSyncError(e)) bandsintownResult.rateLimited = true
        bandsintownResult.errors.push(`Bandsintown sync for ${artist.name}: ${msg}`)
      }
    }

    await writeSyncLog(db, 'bandsintown', bandsintownResult, {
      durationMs: Date.now() - bandsintownStartedAt,
      artistId: onlyArtistId ?? null,
      metadata: { source: 'bandsintown', only_artist_id: onlyArtistId ?? null },
    })
    results.push(bandsintownResult)
  }

  // 6. Standalone Odesli smart-link resolution — runs regardless of whether
  // Spotify sync succeeded or was skipped.  Finds all releases that have a
  // Spotify URL or Apple Music URL but no smart_url yet, and resolves each
  // one through Odesli so they always get a working link.
  let odesliStartedAt: number | null = null

  if (!onlyApi || onlyApi === 'odesli') {
    odesliStartedAt = Date.now()
    const odesliResult: ApiSyncResult = {
      api: 'odesli',
      artistsProcessed: 0,
      releasesUpserted: 0,
      concertsUpserted: 0,
      rateLimited: false,
      errors: [],
    }

    try {
      let releasesQuery = db
        .from('releases')
        .select('id, spotify_url, apple_music_url, artist_id')
        .is('smart_url', null)
        .or('spotify_url.not.is.null,apple_music_url.not.is.null')
        .order('id', { ascending: true })
        .limit(odesliBatchLimit)

      if (onlyArtistId) {
        releasesQuery = releasesQuery.eq('artist_id', onlyArtistId)
      }

      const { data: releasesWithoutSmartUrl, error: batchErr } = await releasesQuery

      if (batchErr) {
        odesliResult.errors.push(`Odesli batch query failed: ${batchErr.message}`)
      }

      const batch = releasesWithoutSmartUrl ?? []
      let odesliRowsAdvanced = 0

      for (const release of batch) {
        const musicUrl = pickOdesliMusicUrl(release.spotify_url, release.apple_music_url)
        const fallbackUrl = release.spotify_url || release.apple_music_url
        if (!musicUrl) {
          // Artist/profile (or otherwise unresolvable) URLs stay smart_url=null
          // forever and the same first N rows are reclaimed every run.
          if (fallbackUrl && (await persistOdesliFallbackSmartUrl(db, release.id, fallbackUrl, odesliResult.errors))) {
            odesliRowsAdvanced++
          }
          continue
        }

        odesliResult.artistsProcessed++

        try {
          const odesli = await resolveOdesliSmartLinkThrottled(musicUrl, fetchFn)
          const appleMusicUrl =
            odesli.platforms['appleMusic'] ?? odesli.platforms['itunes'] ?? null

          const { error: updateErr } = await db
            .from('releases')
            .update({
              smart_url: odesli.smartUrl,
              platform_links: odesli.platforms,
              ...(appleMusicUrl && !release.apple_music_url
                ? { apple_music_url: appleMusicUrl }
                : {}),
            })
            .eq('id', release.id)

          if (updateErr) {
            odesliResult.errors.push(
              `Odesli DB update for release ${release.id}: ${updateErr.message}`,
            )
          } else {
            odesliResult.releasesUpserted++
            odesliRowsAdvanced++
          }
        } catch (e) {
          if (isRateLimitedSyncError(e)) {
            // Do not abort the rest of this batch or later APIs. Skip this
            // item; leftover smart_url=null rows are picked up on the next pass.
            odesliResult.hasMoreWork = true
            continue
          }
          const odesliErr = String(e)
          if (isSkippableOdesliError(odesliErr)) {
            if (await persistOdesliFallbackSmartUrl(db, release.id, musicUrl, odesliResult.errors)) {
              odesliRowsAdvanced++
            }
            continue
          }
          odesliResult.errors.push(`Odesli resolve for release ${release.id}: ${odesliErr}`)
        }
      }

      // Only continue the global Odesli job when this batch advanced the queue
      // (or hit 429). A full page of permanent failures must not reschedule
      // the same rows forever — that leaves Sync Queue at 1 running.
      if (batch.length >= odesliBatchLimit && odesliRowsAdvanced > 0) {
        odesliResult.hasMoreWork = true
      }
    } catch (e) {
      odesliResult.errors.push(`Odesli batch query failed: ${String(e)}`)
    }

    results.push(odesliResult)
  }

  // 7. Odesli platform links for artists — uses each artist's latest
  // resolvable release URL as proxy (artist profile URLs are not supported).
  // Batched like releases so free-tier rate limits do not thrash a single job.
  // Results are merged into the existing odesliResult (same api_source).
  if (!onlyApi || onlyApi === 'odesli') {
    const existingOdesli = results.find((r) => r.api === 'odesli')

    if (existingOdesli) {
      try {
        // Odesli cannot resolve artist profile URLs — use each artist's latest release as proxy.
        let releaseProxyQuery = db
          .from('releases')
          .select('artist_id, spotify_url, apple_music_url, release_date')
          .or('spotify_url.not.is.null,apple_music_url.not.is.null')
          .order('release_date', { ascending: false })

        if (onlyArtistId) {
          releaseProxyQuery = releaseProxyQuery.eq('artist_id', onlyArtistId)
        }

        const { data: proxyReleaseRows, error: proxyErr } = await releaseProxyQuery

        if (proxyErr) {
          existingOdesli?.errors.push(`Odesli release proxy query failed: ${proxyErr.message}`)
        }

        const releaseProxyByArtist = new Map<string, string>()
        for (const row of proxyReleaseRows ?? []) {
          if (!row.artist_id || releaseProxyByArtist.has(row.artist_id)) continue
          const proxyUrl = pickOdesliMusicUrl(row.spotify_url, row.apple_music_url)
          if (proxyUrl) releaseProxyByArtist.set(row.artist_id, proxyUrl)
        }

        const proxyArtistIds = [...releaseProxyByArtist.keys()]
        if (proxyArtistIds.length > 0) {
          let artistsQuery = db
            .from('artists')
            .select('id')
            .is('platform_links', null)
            .in('id', proxyArtistIds)
            .order('id', { ascending: true })
            .limit(odesliBatchLimit)

          if (onlyArtistId) {
            artistsQuery = artistsQuery.eq('id', onlyArtistId)
          }

          const { data: artistsWithoutPlatformLinks, error: batchErr } = await artistsQuery

          if (batchErr) {
            existingOdesli?.errors.push(`Odesli artist batch query failed: ${batchErr.message}`)
          }

          const artistBatch = artistsWithoutPlatformLinks ?? []
          let artistRowsAdvanced = 0

          for (const artist of artistBatch) {
            const musicUrl = releaseProxyByArtist.get(artist.id)
            if (!musicUrl) {
              if (await persistOdesliArtistPlatformLinks(db, artist.id, {}, existingOdesli.errors)) {
                artistRowsAdvanced++
              }
              continue
            }

            if (existingOdesli) existingOdesli.artistsProcessed++

            try {
              const odesli = await resolveOdesliSmartLinkThrottled(musicUrl, fetchFn)
              const platforms = odesli.platforms
              const { error: updateErr } = await db
                .from('artists')
                .update({ platform_links: Object.keys(platforms).length > 0 ? platforms : {} })
                .eq('id', artist.id)

              if (updateErr) {
                existingOdesli?.errors.push(
                  `Odesli DB update for artist ${artist.id}: ${updateErr.message}`,
                )
              } else if (existingOdesli) {
                if (Object.keys(platforms).length > 0) existingOdesli.releasesUpserted++
                artistRowsAdvanced++
              }
            } catch (e) {
              if (isRateLimitedSyncError(e)) {
                existingOdesli.hasMoreWork = true
                continue
              }
              const odesliErr = String(e)
              if (isSkippableOdesliError(odesliErr)) {
                if (await persistOdesliArtistPlatformLinks(db, artist.id, {}, existingOdesli.errors)) {
                  artistRowsAdvanced++
                }
                continue
              }
              existingOdesli.errors.push(`Odesli resolve for artist ${artist.id}: ${odesliErr}`)
            }
          }

          if (artistBatch.length >= odesliBatchLimit && artistRowsAdvanced > 0) {
            existingOdesli.hasMoreWork = true
          }
        }
      } catch (e) {
        existingOdesli?.errors.push(`Odesli artist batch query failed: ${String(e)}`)
      }
    }

    // Write one combined sync_log for releases + artist platform links
    if (existingOdesli) {
      await writeSyncLog(db, 'odesli', existingOdesli, {
        durationMs: odesliStartedAt !== null ? Date.now() - odesliStartedAt : undefined,
        artistId: onlyArtistId ?? null,
        metadata: { source: 'odesli', only_artist_id: onlyArtistId ?? null },
      })
    }
  }

  return {
    results,
    totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
  }
}

// ---------------------------------------------------------------------------
// Single-artist queue entry point
// ---------------------------------------------------------------------------

/**
 * Syncs one artist identified by `artistId` using the APIs implied by
 * `jobType`.  This is the function called by the sync-queue executor
 * (`app/api/sync/route.ts`) for each queue job so that exactly
 * one artist is processed per invocation.
 *
 * jobType → onlyApi mapping:
 *   'spotify' / 'discogs' / 'odesli' / 'songkick' / 'bandsintown' → that API only
 *   'full' / anything else → all configured APIs run
 *   'youtube'  → NOT handled here (channel-level). Use POST /api/sync-youtube.
 *                Legacy queue rows with job_type=youtube fall through to full.
 */
export async function syncSingleArtist(
  artistId: string,
  jobType: string,
  deps: SyncAllDeps,
): Promise<SyncAllResult> {
  const onlyApi =
    jobType === 'spotify'
      ? 'spotify'
      : jobType === 'discogs'
        ? 'discogs'
        : jobType === 'odesli'
          ? 'odesli'
          : jobType === 'songkick'
            ? 'songkick'
            : jobType === 'bandsintown'
              ? 'bandsintown'
              : undefined
  return syncAll({ ...deps, onlyArtistId: artistId, onlyApi })
}

/** Runs a single Odesli batch (global queue job). */
export async function syncOdesliBatch(deps: SyncAllDeps): Promise<SyncAllResult> {
  return syncAll({ ...deps, onlyApi: 'odesli', onlyArtistId: undefined })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function persistOdesliFallbackSmartUrl(
  db: SupabaseClient<Database>,
  releaseId: string,
  fallbackUrl: string,
  errors: string[],
): Promise<boolean> {
  const { error } = await db
    .from('releases')
    .update({ smart_url: fallbackUrl })
    .eq('id', releaseId)
  if (error) {
    errors.push(`Odesli fallback update for release ${releaseId}: ${error.message}`)
    return false
  }
  return true
}

async function persistOdesliArtistPlatformLinks(
  db: SupabaseClient<Database>,
  artistId: string,
  platforms: Record<string, string>,
  errors: string[],
): Promise<boolean> {
  const { error } = await db
    .from('artists')
    .update({ platform_links: platforms })
    .eq('id', artistId)
  if (error) {
    errors.push(`Odesli fallback update for artist ${artistId}: ${error.message}`)
    return false
  }
  return true
}

interface WriteSyncLogOptions {
  durationMs?: number
  metadata?: Record<string, unknown>
  artistId?: string | null
}

async function writeSyncLog(
  db: SupabaseClient<Database>,
  apiSource: string,
  result: ApiSyncResult,
  options?: WriteSyncLogOptions,
): Promise<void> {
  const status: 'success' | 'partial' | 'error' =
    result.errors.length === 0
      ? 'success'
      : result.releasesUpserted + result.concertsUpserted > 0
        ? 'partial'
        : 'error'

  await db.from('sync_logs').insert({
    artist_id: options?.artistId ?? null,
    status,
    message: result.errors[0] ?? null,
    releases_synced: result.releasesUpserted,
    errors: result.errors,
    api_source: apiSource,
    rate_limited: result.rateLimited,
    duration_ms: options?.durationMs ?? null,
    metadata: {
      artists_processed: result.artistsProcessed,
      concerts_synced: result.concertsUpserted,
      ...options?.metadata,
    },
  })
}
