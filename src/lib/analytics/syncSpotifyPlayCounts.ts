/**
 * Orchestrates Apify Spotify play-count scrapes for visible artists/releases.
 * Does not write SOS settlement tables (streaming_stats / territory metrics).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ApiError } from '@/lib/errors'
import { upsertListenerMetrics } from '@/lib/api/artistListenerMetrics'
import { upsertSpotifyTrackPlaySnapshots } from '@/lib/api/spotifyTrackPlaySnapshots'
import { getApifyUsageMonth, incrementApifyUsage } from '@/lib/api/apifyUsage'
import { resolveSpotifyEntityUrl } from '@/lib/analytics/apifySpotifyUrls'
import {
  APIFY_MONTHLY_URL_BUDGET,
  APIFY_URL_BATCH_SIZE,
  type ApifyDatasetItem,
  type ApifyPlayCountClient,
  createApifyPlayCountClient,
} from '@/lib/analytics/apifySpotifyPlayCountClient'
import { utcPeriodMonth } from '@/lib/analytics/periodMonth'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type ServiceClient = SupabaseClient<Database>

export type SpotifyPlaySyncScope = 'artists' | 'releases' | 'all'

export interface SpotifyPlaySyncOptions {
  scope?: SpotifyPlaySyncScope
  dryRun?: boolean
  /** Host organization for roster + Apify budget (default Org #0) */
  organizationId?: string
  /** Inject for tests */
  client?: ApifyPlayCountClient
  /** Inject for tests — wall clock limit for multi-batch processing */
  timeBudgetMs?: number
  now?: Date
}

export interface SpotifyPlayTarget {
  kind: 'artist' | 'album'
  entityId: string
  artistId: string
  spotifyId: string
  url: string
}

export interface SpotifyPlaySyncResult {
  period: string
  scope: SpotifyPlaySyncScope
  dryRun: boolean
  budget: {
    limit: number
    usedBefore: number
    usedAfter: number
    remaining: number
  }
  targets: {
    artists: number
    releases: number
    skippedInvalidUrl: number
    truncatedByBudget: number
  }
  urlsCharged: number
  upserted: {
    listenerRows: number
    trackRows: number
  }
  batches: number
  partial: boolean
  errors: Array<{ spotifyId?: string; message: string }>
  durationMs: number
}

function isAlbumItem(item: ApifyDatasetItem): boolean {
  return Array.isArray(item.tracks) && item.tracks.length > 0 && typeof item.id === 'string'
}

function isArtistItem(item: ApifyDatasetItem): boolean {
  return (
    typeof item.monthlyListeners === 'number' ||
    typeof item.followers === 'number' ||
    (Array.isArray(item.topTracks) && !Array.isArray(item.tracks))
  )
}

export async function loadEligibleArtistTargets(
  db: ServiceClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<{ targets: SpotifyPlayTarget[]; skippedInvalidUrl: number }> {
  const { data, error } = await db
    .from('artists')
    .select('id, spotify_id, spotify_url')
    .eq('is_visible', true)
    .eq('organization_id', organizationId)

  if (error) throw new Error(error.message)

  const targets: SpotifyPlayTarget[] = []
  let skippedInvalidUrl = 0
  const seen = new Set<string>()

  for (const row of data ?? []) {
    const resolved = resolveSpotifyEntityUrl('artist', row.spotify_id, row.spotify_url)
    if (!resolved) {
      if (row.spotify_id || row.spotify_url) skippedInvalidUrl += 1
      continue
    }
    if (seen.has(resolved.id)) continue
    seen.add(resolved.id)
    targets.push({
      kind: 'artist',
      entityId: row.id,
      artistId: row.id,
      spotifyId: resolved.id,
      url: resolved.url,
    })
  }

  return { targets, skippedInvalidUrl }
}

export async function loadEligibleReleaseTargets(
  db: ServiceClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<{ targets: SpotifyPlayTarget[]; skippedInvalidUrl: number }> {
  const { data: visibleArtists, error: artistError } = await db
    .from('artists')
    .select('id')
    .eq('is_visible', true)
    .eq('organization_id', organizationId)

  if (artistError) throw new Error(artistError.message)
  const visibleArtistIds = new Set((visibleArtists ?? []).map((a) => a.id))
  if (visibleArtistIds.size === 0) {
    return { targets: [], skippedInvalidUrl: 0 }
  }

  const { data, error } = await db
    .from('releases')
    .select('id, artist_id, spotify_id, spotify_url')
    .eq('is_visible', true)
    .eq('organization_id', organizationId)

  if (error) throw new Error(error.message)

  const targets: SpotifyPlayTarget[] = []
  let skippedInvalidUrl = 0
  const seen = new Set<string>()

  for (const row of data ?? []) {
    const artistId = row.artist_id
    if (!artistId || !visibleArtistIds.has(artistId)) continue
    const resolved = resolveSpotifyEntityUrl('album', row.spotify_id, row.spotify_url)
    if (!resolved) {
      if (row.spotify_id || row.spotify_url) skippedInvalidUrl += 1
      continue
    }
    if (seen.has(resolved.id)) continue
    seen.add(resolved.id)
    targets.push({
      kind: 'album',
      entityId: row.id,
      artistId,
      spotifyId: resolved.id,
      url: resolved.url,
    })
  }

  return { targets, skippedInvalidUrl }
}

function applyBudgetCap(
  ordered: SpotifyPlayTarget[],
  remaining: number,
): { selected: SpotifyPlayTarget[]; truncated: number } {
  if (remaining <= 0) return { selected: [], truncated: ordered.length }
  if (ordered.length <= remaining) return { selected: ordered, truncated: 0 }
  return {
    selected: ordered.slice(0, remaining),
    truncated: ordered.length - remaining,
  }
}

function mapArtistItems(
  items: ApifyDatasetItem[],
  bySpotifyId: Map<string, SpotifyPlayTarget>,
  period: string,
): {
  listenerRows: Parameters<typeof upsertListenerMetrics>[1]
  softErrors: Array<{ spotifyId?: string; message: string }>
} {
  const listenerRows: Parameters<typeof upsertListenerMetrics>[1] = []
  const softErrors: Array<{ spotifyId?: string; message: string }> = []

  for (const item of items) {
    if (!isArtistItem(item) || isAlbumItem(item)) continue
    const spotifyId = item.id
    if (!spotifyId) {
      softErrors.push({ message: 'Artist dataset item missing Spotify id' })
      continue
    }
    const target = bySpotifyId.get(spotifyId)
    if (!target || target.kind !== 'artist') {
      softErrors.push({
        spotifyId,
        message: 'Artist result did not match an eligible visible artist',
      })
      continue
    }

    if (typeof item.monthlyListeners === 'number') {
      listenerRows.push({
        artistId: target.artistId,
        source: 'apify',
        metricType: 'listeners',
        period,
        value: Math.max(0, Math.round(item.monthlyListeners)),
      })
    }
    if (typeof item.followers === 'number') {
      listenerRows.push({
        artistId: target.artistId,
        source: 'apify',
        metricType: 'followers',
        period,
        value: Math.max(0, Math.round(item.followers)),
      })
    }
    if (Array.isArray(item.topTracks) && item.topTracks.length > 0) {
      const plays = item.topTracks.reduce(
        (sum, t) => sum + (typeof t.streamCount === 'number' ? t.streamCount : 0),
        0,
      )
      listenerRows.push({
        artistId: target.artistId,
        source: 'apify',
        metricType: 'plays',
        period,
        value: Math.max(0, Math.round(plays)),
      })
    }
  }

  return { listenerRows, softErrors }
}

function mapAlbumItems(
  items: ApifyDatasetItem[],
  bySpotifyId: Map<string, SpotifyPlayTarget>,
  period: string,
): {
  trackRows: Parameters<typeof upsertSpotifyTrackPlaySnapshots>[1]
  softErrors: Array<{ spotifyId?: string; message: string }>
} {
  const trackRows: Parameters<typeof upsertSpotifyTrackPlaySnapshots>[1] = []
  const softErrors: Array<{ spotifyId?: string; message: string }> = []

  for (const item of items) {
    if (!isAlbumItem(item)) continue
    const albumId = item.id!
    const target = bySpotifyId.get(albumId)
    if (!target || target.kind !== 'album') {
      softErrors.push({
        spotifyId: albumId,
        message: 'Album result did not match an eligible visible release',
      })
      continue
    }

    for (const track of item.tracks ?? []) {
      if (!track.id || typeof track.streamCount !== 'number') continue
      trackRows.push({
        artistId: target.artistId,
        releaseId: target.entityId,
        spotifyTrackId: track.id,
        spotifyAlbumId: albumId,
        trackName: track.name ?? null,
        playCount: Math.max(0, Math.round(track.streamCount)),
        period,
      })
    }
  }

  return { trackRows, softErrors }
}

/**
 * Main entry: dry-run or live scrape for artists and/or releases.
 */
export async function syncSpotifyPlayCounts(
  db: ServiceClient,
  apifyToken: string | null | undefined,
  options: SpotifyPlaySyncOptions = {},
): Promise<SpotifyPlaySyncResult> {
  const started = Date.now()
  const scope: SpotifyPlaySyncScope = options.scope ?? 'all'
  const dryRun = options.dryRun === true
  const organizationId = options.organizationId ?? DEFAULT_ORGANIZATION_ID
  const now = options.now ?? new Date()
  const period = utcPeriodMonth(now)
  const timeBudgetMs = options.timeBudgetMs ?? 280_000

  const usage = await getApifyUsageMonth(db, period, organizationId)
  const budgetLimit = usage.budget || APIFY_MONTHLY_URL_BUDGET
  const usedBefore = usage.urlsCharged
  const remainingBudget = Math.max(0, budgetLimit - usedBefore)

  if (!dryRun && remainingBudget <= 0) {
    throw new ApiError(
      429,
      `Monthly Apify free budget exhausted (${budgetLimit} URLs). Used: ${usedBefore}/${budgetLimit} for ${period}. Try again next month or reduce scope.`,
      'APIFY_BUDGET_EXCEEDED',
    )
  }

  let artistTargets: SpotifyPlayTarget[] = []
  let releaseTargets: SpotifyPlayTarget[] = []
  let skippedInvalidUrl = 0

  if (scope === 'artists' || scope === 'all') {
    const a = await loadEligibleArtistTargets(db, organizationId)
    artistTargets = a.targets
    skippedInvalidUrl += a.skippedInvalidUrl
  }
  if (scope === 'releases' || scope === 'all') {
    const r = await loadEligibleReleaseTargets(db, organizationId)
    releaseTargets = r.targets
    skippedInvalidUrl += r.skippedInvalidUrl
  }

  // Prefer artists first when scope=all so listeners land even if budget is tight
  const ordered = [...artistTargets, ...releaseTargets]
  if (ordered.length === 0) {
    throw new ApiError(
      400,
      'No visible artists or releases with a Spotify link were found to sync.',
      'APIFY_NO_TARGETS',
    )
  }

  const { selected, truncated } = applyBudgetCap(ordered, dryRun ? ordered.length : remainingBudget)

  if (!dryRun && selected.length === 0) {
    throw new ApiError(
      429,
      `Monthly Apify free budget exhausted (${budgetLimit} URLs). Used: ${usedBefore}/${budgetLimit} for ${period}. Try again next month or reduce scope.`,
      'APIFY_BUDGET_EXCEEDED',
    )
  }

  const result: SpotifyPlaySyncResult = {
    period,
    scope,
    dryRun,
    budget: {
      limit: budgetLimit,
      usedBefore,
      usedAfter: usedBefore,
      remaining: remainingBudget,
    },
    targets: {
      artists: artistTargets.length,
      releases: releaseTargets.length,
      skippedInvalidUrl,
      truncatedByBudget: dryRun ? 0 : truncated,
    },
    urlsCharged: 0,
    upserted: { listenerRows: 0, trackRows: 0 },
    batches: 0,
    partial: truncated > 0,
    errors: [],
    durationMs: 0,
  }

  if (dryRun) {
    result.durationMs = Date.now() - started
    result.budget.remaining = remainingBudget
    return result
  }

  if (!apifyToken?.trim()) {
    throw new ApiError(
      503,
      'Apify is not configured. Add your Apify API token under Admin → API Keys.',
      'APIFY_NOT_CONFIGURED',
    )
  }

  const client = options.client ?? createApifyPlayCountClient(apifyToken.trim())
  const bySpotifyId = new Map(selected.map((t) => [t.spotifyId, t]))

  let urlsCharged = 0
  let cursor = 0

  while (cursor < selected.length) {
    if (Date.now() - started > timeBudgetMs) {
      result.partial = true
      result.errors.push({
        message: 'Stopped early to stay within the server time budget. Re-run to continue.',
      })
      break
    }

    const batch = selected.slice(cursor, cursor + APIFY_URL_BATCH_SIZE)
    cursor += batch.length
    result.batches += 1

    try {
      const run = await client.runPlayCountScraper(batch.map((t) => t.url))
      const artistMapped = mapArtistItems(run.items, bySpotifyId, period)
      const albumMapped = mapAlbumItems(run.items, bySpotifyId, period)
      result.errors.push(...artistMapped.softErrors, ...albumMapped.softErrors)

      if (artistMapped.listenerRows.length > 0) {
        result.upserted.listenerRows += await upsertListenerMetrics(db, artistMapped.listenerRows)
      }
      if (albumMapped.trackRows.length > 0) {
        result.upserted.trackRows += await upsertSpotifyTrackPlaySnapshots(
          db,
          albumMapped.trackRows,
        )
      }

      await incrementApifyUsage(db, period, run.urlsInBatch, budgetLimit, organizationId)
      urlsCharged += run.urlsInBatch
    } catch (err) {
      if (err instanceof ApiError) {
        // Persist partial progress before rethrowing hard failures when we already charged some
        result.urlsCharged = urlsCharged
        result.budget.usedAfter = usedBefore + urlsCharged
        result.budget.remaining = Math.max(0, budgetLimit - result.budget.usedAfter)
        result.durationMs = Date.now() - started
        if (urlsCharged > 0) {
          result.partial = true
          result.errors.push({ message: err.message })
          // Return partial success rather than failing the whole HTTP request
          if (err.status === 504 || err.code === 'APIFY_TIMEOUT') {
            return result
          }
        }
        throw err
      }
      result.errors.push({
        message: err instanceof Error ? err.message : 'Unknown scrape error',
      })
      result.partial = true
      break
    }
  }

  if (cursor < selected.length) {
    result.partial = true
  }

  result.urlsCharged = urlsCharged
  result.budget.usedAfter = usedBefore + urlsCharged
  result.budget.remaining = Math.max(0, budgetLimit - result.budget.usedAfter)
  result.durationMs = Date.now() - started
  return result
}
