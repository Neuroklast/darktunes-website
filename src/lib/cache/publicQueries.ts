/**
 * src/lib/cache/publicQueries.ts
 *
 * Reusable `unstable_cache`-wrapped fetchers for publicly readable data.
 *
 * Each helper creates its own public Supabase client inside the cache callback
 * (safe: no Dynamic API calls) and provides a `.catch()` fallback so that a
 * failing Supabase connection stores an empty result in the Data Cache rather
 * than propagating an error on every subsequent request.
 *
 * Revalidation tags are shared with the admin-side on-demand revalidation so
 * that `revalidateTag('releases')` etc. works across all pages.
 */

import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getPublicReleases } from '@/lib/api/releases'
import { getPublicNewsPosts } from '@/lib/api/news'
import { getPublicVideos } from '@/lib/api/videos'
import { getPublicConcerts } from '@/lib/api/concerts'
import { getPublicArtists, type PublicArtist } from '@/lib/api/publicArtist'
import { getSiteSettings } from '@/lib/api/siteSettings'
import type { Release, NewsPost, Video, Concert, SiteSettings } from '@/types'

// Rely on on-demand revalidateTag() webhooks (/api/revalidate-content) rather than
// short-lived TTLs. A 1-hour TTL caps staleness when webhooks miss; content
// maintenance (scheduled publish, hero enforcement, emoji cleanup) now runs via
// the Supabase Cron → Edge Function pipeline to keep the read path read-only.
const TTL = 3600 // seconds

/** All public releases, cache-keyed to the `releases` tag. */
export const getCachedPublicReleases = cache(unstable_cache(
  async (): Promise<Release[]> =>
    getPublicReleases(createPublicSupabaseClient()).catch(() => [] as Release[]),
  ['public-releases'],
  { revalidate: TTL, tags: ['releases'] },
))

/** All public news posts, cache-keyed to the `news` tag. */
export const getCachedPublicNews = cache(unstable_cache(
  async (): Promise<NewsPost[]> =>
    getPublicNewsPosts(createPublicSupabaseClient()).catch(() => [] as NewsPost[]),
  ['public-news'],
  { revalidate: TTL, tags: ['news'] },
))

/** All public videos (full catalogue), cache-keyed to the `videos` tag. */
const _getCachedPublicVideosAll = cache(unstable_cache(
  async (): Promise<Video[]> =>
    getPublicVideos(createPublicSupabaseClient()).catch(() => [] as Video[]),
  ['public-videos', 'all'],
  { revalidate: TTL, tags: ['videos'] },
))

/** Public videos with Shorts excluded, cache-keyed to the `videos` tag. */
const _getCachedPublicVideosNoShorts = cache(unstable_cache(
  async (): Promise<Video[]> =>
    getPublicVideos(createPublicSupabaseClient(), { excludeShorts: true }).catch(() => [] as Video[]),
  ['public-videos', 'no-shorts'],
  { revalidate: TTL, tags: ['videos'] },
))

/**
 * Returns public videos, optionally excluding YouTube Shorts.
 * Two separate cache entries are used so each variant has a stable cache key.
 */
export function getCachedPublicVideos(options: { excludeShorts?: boolean } = {}): Promise<Video[]> {
  return options.excludeShorts ? _getCachedPublicVideosNoShorts() : _getCachedPublicVideosAll()
}

/** All public concerts, cache-keyed to the `concerts` tag. */
export const getCachedPublicConcerts = cache(unstable_cache(
  async (): Promise<Concert[]> =>
    getPublicConcerts(createPublicSupabaseClient()).catch(() => [] as Concert[]),
  ['public-concerts'],
  { revalidate: TTL, tags: ['concerts'] },
))

/** All public artists (safe columns only), cache-keyed to the `artists` tag. */
export const getCachedPublicArtists = cache(unstable_cache(
  async (): Promise<PublicArtist[]> =>
    getPublicArtists(createPublicSupabaseClient()).catch(() => [] as PublicArtist[]),
  ['public-artists'],
  { revalidate: TTL, tags: ['artists'] },
))

/** Site-wide settings, cache-keyed to the `site-settings` tag. */
export const getCachedSiteSettings = cache(unstable_cache(
  async (): Promise<SiteSettings | null> =>
    getSiteSettings(createPublicSupabaseClient()).catch(() => null),
  ['public-site-settings'],
  { revalidate: TTL, tags: ['site-settings'] },
))
