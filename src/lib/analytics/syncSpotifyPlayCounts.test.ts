import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/errors'
import {
  syncSpotifyPlayCounts,
  type SpotifyPlayTarget,
} from './syncSpotifyPlayCounts'
import type { ApifyPlayCountClient } from './apifySpotifyPlayCountClient'

function makeDb(opts: {
  usage?: { urls_charged: number; budget: number }
  artists?: Array<{ id: string; spotify_id: string | null; spotify_url: string | null }>
  releases?: Array<{
    id: string
    artist_id: string
    spotify_id: string | null
    spotify_url: string | null
  }>
  visibleArtistIds?: string[]
}) {
  const usage = opts.usage ?? { urls_charged: 0, budget: 1200 }
  const artists = opts.artists ?? []
  const releases = opts.releases ?? []
  const visibleArtistIds = opts.visibleArtistIds ?? artists.map((a) => a.id)

  const upserted: unknown[] = []

  const from = vi.fn((table: string) => {
    if (table === 'apify_usage_months') {
      const usageRow = {
        organization_id: '00000000-0000-0000-0000-000000000000',
        year_month: '2026-07',
        urls_charged: usage.urls_charged,
        budget: usage.budget,
        updated_at: new Date().toISOString(),
      }
      const usageTerminal = {
        maybeSingle: async () => ({ data: usageRow, error: null }),
        single: async () => ({
          data: { ...usageRow, urls_charged: usage.urls_charged + 1 },
          error: null,
        }),
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => usageTerminal,
            ...usageTerminal,
          }),
        }),
        upsert: () => ({
          select: () => ({
            single: async () => ({
              data: {
                organization_id: '00000000-0000-0000-0000-000000000000',
                year_month: '2026-07',
                urls_charged: usage.urls_charged + 1,
                budget: usage.budget,
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'artists') {
      const result = () => {
        if (opts.visibleArtistIds && !opts.artists) {
          return { data: visibleArtistIds.map((id) => ({ id })), error: null }
        }
        return { data: artists, error: null }
      }
      // Fluent .eq().eq() then await
      const artistChain = {
        eq: () => artistChain,
        then: (onfulfilled: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) =>
          Promise.resolve(result()).then(onfulfilled, onrejected),
      }
      return { select: () => artistChain }
    }
    if (table === 'releases') {
      const releaseChain = {
        eq: () => releaseChain,
        then: (onfulfilled: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) =>
          Promise.resolve({ data: releases, error: null }).then(onfulfilled, onrejected),
      }
      return { select: () => releaseChain }
    }
    if (table === 'artist_listener_metrics' || table === 'spotify_track_play_snapshots') {
      return {
        upsert: async (payload: unknown) => {
          upserted.push(payload)
          return { error: null }
        },
      }
    }
    return {
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
      upsert: async () => ({ error: null }),
    }
  })

  return { from, __upserted: upserted } as unknown as {
    from: typeof from
    __upserted: unknown[]
  } & Parameters<typeof syncSpotifyPlayCounts>[0]
}

describe('syncSpotifyPlayCounts', () => {
  const artistId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const spotifyArtistId = '7Ln80lUS6He07XvHI8qqHH'

  it('dryRun returns eligibility without requiring a token', async () => {
    const db = makeDb({
      artists: [{ id: artistId, spotify_id: spotifyArtistId, spotify_url: null }],
    })

    const result = await syncSpotifyPlayCounts(db, null, {
      scope: 'artists',
      dryRun: true,
      now: new Date('2026-07-15T12:00:00Z'),
    })

    expect(result.dryRun).toBe(true)
    expect(result.targets.artists).toBe(1)
    expect(result.urlsCharged).toBe(0)
    expect(result.period).toBe('2026-07')
  })

  it('throws APIFY_NO_TARGETS when nothing is eligible', async () => {
    const db = makeDb({ artists: [] })
    await expect(
      syncSpotifyPlayCounts(db, 'token', { scope: 'artists', dryRun: true }),
    ).rejects.toMatchObject({ code: 'APIFY_NO_TARGETS', status: 400 })
  })

  it('throws APIFY_BUDGET_EXCEEDED when monthly budget is exhausted', async () => {
    const db = makeDb({
      usage: { urls_charged: 1200, budget: 1200 },
      artists: [{ id: artistId, spotify_id: spotifyArtistId, spotify_url: null }],
    })
    await expect(
      syncSpotifyPlayCounts(db, 'token', {
        scope: 'artists',
        dryRun: false,
        now: new Date('2026-07-15T12:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'APIFY_BUDGET_EXCEEDED', status: 429 })
  })

  it('throws APIFY_NOT_CONFIGURED for live sync without token', async () => {
    const db = makeDb({
      artists: [{ id: artistId, spotify_id: spotifyArtistId, spotify_url: null }],
    })
    await expect(
      syncSpotifyPlayCounts(db, null, { scope: 'artists', dryRun: false }),
    ).rejects.toMatchObject({ code: 'APIFY_NOT_CONFIGURED', status: 503 })
  })

  it('maps artist items into listener upserts via injected client', async () => {
    const db = makeDb({
      artists: [{ id: artistId, spotify_id: spotifyArtistId, spotify_url: null }],
    })

    const client: ApifyPlayCountClient = {
      runPlayCountScraper: async (urls) => ({
        runId: 'run-1',
        status: 'SUCCEEDED',
        datasetId: 'ds-1',
        urlsInBatch: urls.length,
        items: [
          {
            id: spotifyArtistId,
            monthlyListeners: 12_400,
            followers: 5_000,
            topTracks: [{ id: 't1', name: 'Hit', streamCount: 100 }],
          },
        ],
      }),
    }

    const result = await syncSpotifyPlayCounts(db, 'token', {
      scope: 'artists',
      client,
      now: new Date('2026-07-15T12:00:00Z'),
    })

    expect(result.urlsCharged).toBe(1)
    expect(result.upserted.listenerRows).toBe(3)
    expect(result.batches).toBe(1)
  })

  it('skips artists without resolvable Spotify identity in dryRun counts', async () => {
    const db = makeDb({
      artists: [
        { id: artistId, spotify_id: null, spotify_url: 'https://example.com/not-spotify' },
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          spotify_id: spotifyArtistId,
          spotify_url: null,
        },
      ],
    })

    const result = await syncSpotifyPlayCounts(db, null, {
      scope: 'artists',
      dryRun: true,
    })
    expect(result.targets.artists).toBe(1)
    expect(result.targets.skippedInvalidUrl).toBe(1)
  })
})

// Type-only smoke: ensure SpotifyPlayTarget stays exported for route consumers
export type _Target = SpotifyPlayTarget

// Silence unused ApiError import if tree-shaken oddly
void ApiError
