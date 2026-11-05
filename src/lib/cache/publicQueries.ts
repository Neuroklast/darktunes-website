/**
 * src/lib/cache/publicQueries.ts
 *
 * Reusable `unstable_cache`-wrapped fetchers for publicly readable data.
 *
 * Each helper creates its own public Supabase client inside the cache callback
 * (safe: no Dynamic API calls). The cache callback deliberately has NO
 * `.catch()`: if Supabase fails (e.g. 429 rate limit) the callback rejects, so
 * Next.js does not overwrite the Data Cache and keeps serving the last good
 * (stale) value; with no entry at all the error propagates and nothing is
 * cached. The empty fallback (`[]` / `null`) is applied OUTSIDE the cache by
 * `withUncachedFallback`, together with a `logError`, so an outage is never
 * stored as empty public data for the TTL.
 *
 * Revalidation tags are shared with the admin-side on-demand revalidation so
 * that `revalidateTag('releases')` etc. works across all pages.
 */

import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { logError } from '@/lib/observability/logger'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getAllVisibleReleasesForCalendar, getPublicReleases } from '@/lib/api/releases'
import { getPublicNewsPosts } from '@/lib/api/news'
import { getPublicVideos } from '@/lib/api/videos'
import { getAllVisibleConcertsForCalendar, getPublicConcerts } from '@/lib/api/concerts'
import { getPublicArtists, type PublicArtist } from '@/lib/api/publicArtist'
import { getSiteSettings } from '@/lib/api/siteSettings'
import type { Release, NewsPost, Video, Concert, SiteSettings } from '@/types'

// Rely on on-demand revalidateTag() webhooks (/api/revalidate-content) rather than
// short-lived TTLs. A 1-hour TTL caps staleness when webhooks miss; content
// non-news maintenance runs separately. Scheduled news is evaluated by its
// publish date during each public request without any background status write.
const TTL = 3600 // seconds

/**
 * Wraps a cached reader so that a rejection (Supabase error) resolves to
 * `fallback` AFTER the cache layer. The fallback is therefore never stored in
 * the Data Cache. Keeps React `cache()` per-request memoization.
 */
function withUncachedFallback<T>(
  read: () => Promise<T>,
  fallback: T,
  key: string,
): () => Promise<T> {
  return cache(async (): Promise<T> => {
    try {
      return await read()
    } catch (error) {
      logError('public_cache.read_failed', error, { key })
      return fallback
    }
  })
}

/** All public releases, cache-keyed to the `releases` tag. */
export const getCachedPublicReleases: () => Promise<Release[]> = withUncachedFallback(
  unstable_cache(
    async (): Promise<Release[]> => getPublicReleases(createPublicSupabaseClient()),
    ['public-releases'],
    { revalidate: TTL, tags: ['releases'] },
  ),
  [],
  'public-releases',
)

/**
 * Slim portal calendar payload (nested artists, calendar columns only).
 * Cookie-free client inside unstable_cache; invalidated with `releases` tag.
 */
export const getCachedCalendarReleases: () => Promise<Release[]> = withUncachedFallback(
  unstable_cache(
    async (): Promise<Release[]> => getAllVisibleReleasesForCalendar(createPublicSupabaseClient()),
    ['portal-calendar-releases'],
    { revalidate: TTL, tags: ['releases'] },
  ),
  [],
  'portal-calendar-releases',
)

/**
 * Slim portal calendar concerts (past + future, nested artists).
 * Cookie-free client; invalidated with `concerts` tag.
 */
export const getCachedCalendarConcerts: () => Promise<Concert[]> = withUncachedFallback(
  unstable_cache(
    async (): Promise<Concert[]> => getAllVisibleConcertsForCalendar(createPublicSupabaseClient()),
    ['portal-calendar-concerts'],
    { revalidate: TTL, tags: ['concerts'] },
  ),
  [],
  'portal-calendar-concerts',
)

/**
 * News is time-sensitive: storing a due-only query in the Data Cache would
 * hide posts scheduled after the cache entry was created until the TTL expires.
 * React cache() coalesces multiple calls within one server request only.
 * Other site catalogues keep their tagged Data Cache entries.
 */
export const getCachedPublicNews: () => Promise<NewsPost[]> = withUncachedFallback(
  async (): Promise<NewsPost[]> => getPublicNewsPosts(createPublicSupabaseClient()),
  [],
  'public-news',
)

/** All public videos (full catalogue), cache-keyed to the `videos` tag. */
const _getCachedPublicVideosAll: () => Promise<Video[]> = withUncachedFallback(
  unstable_cache(
    async (): Promise<Video[]> => getPublicVideos(createPublicSupabaseClient()),
    ['public-videos', 'all'],
    { revalidate: TTL, tags: ['videos'] },
  ),
  [],
  'public-videos/all',
)

/** Public videos with Shorts excluded, cache-keyed to the `videos` tag. */
const _getCachedPublicVideosNoShorts: () => Promise<Video[]> = withUncachedFallback(
  unstable_cache(
    async (): Promise<Video[]> => getPublicVideos(createPublicSupabaseClient(), { excludeShorts: true }),
    ['public-videos', 'no-shorts'],
    { revalidate: TTL, tags: ['videos'] },
  ),
  [],
  'public-videos/no-shorts',
)

/**
 * Returns public videos, optionally excluding YouTube Shorts.
 * Two separate cache entries are used so each variant has a stable cache key.
 */
export function getCachedPublicVideos(options: { excludeShorts?: boolean } = {}): Promise<Video[]> {
  return options.excludeShorts ? _getCachedPublicVideosNoShorts() : _getCachedPublicVideosAll()
}

/** All public concerts, cache-keyed to the `concerts` tag. */
export const getCachedPublicConcerts: () => Promise<Concert[]> = withUncachedFallback(
  unstable_cache(
    async (): Promise<Concert[]> => getPublicConcerts(createPublicSupabaseClient()),
    ['public-concerts'],
    { revalidate: TTL, tags: ['concerts'] },
  ),
  [],
  'public-concerts',
)

/** All public artists (safe columns only), cache-keyed to the `artists` tag. */
export const getCachedPublicArtists: () => Promise<PublicArtist[]> = withUncachedFallback(
  unstable_cache(
    async (): Promise<PublicArtist[]> => getPublicArtists(createPublicSupabaseClient()),
    ['public-artists'],
    { revalidate: TTL, tags: ['artists'] },
  ),
  [],
  'public-artists',
)

/** Site-wide settings, cache-keyed to the `site-settings` tag. */
export const getCachedSiteSettings: () => Promise<SiteSettings | null> = withUncachedFallback(
  unstable_cache(
    async (): Promise<SiteSettings | null> => getSiteSettings(createPublicSupabaseClient()),
    ['public-site-settings'],
    { revalidate: TTL, tags: ['site-settings'] },
  ),
  null,
  'public-site-settings',
)
