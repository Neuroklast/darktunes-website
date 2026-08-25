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
 * Cache keys and tags are organization-scoped (`o:{orgId}:…`) to prevent
 * cross-tenant bleed. Pass `organizationId` from `getRequestOrganizationId()`.
 */

import { unstable_cache } from 'next/cache'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import { getAllVisibleReleasesForCalendar, getPublicReleases } from '@/lib/api/releases'
import { getPublicNewsPosts } from '@/lib/api/news'
import { getPublicVideos } from '@/lib/api/videos'
import { getAllVisibleConcertsForCalendar, getPublicConcerts } from '@/lib/api/concerts'
import { getPublicArtists, type PublicArtist } from '@/lib/api/publicArtist'
import { getSiteSettings } from '@/lib/api/siteSettings'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { orgTag } from '@/lib/organizations/cacheTags'
import type { Release, NewsPost, Video, Concert, SiteSettings } from '@/types'

const TTL = 3600 // seconds

/** All public releases for an organization. */
export function getCachedPublicReleases(
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Release[]> {
  return unstable_cache(
    async (): Promise<Release[]> =>
      getPublicReleases(createPublicSupabaseClient(), organizationId).catch(() => [] as Release[]),
    ['public-releases', organizationId],
    { revalidate: TTL, tags: ['releases', orgTag(organizationId, 'releases')] },
  )()
}

/**
 * Slim portal calendar payload (nested artists, calendar columns only).
 */
export function getCachedCalendarReleases(
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Release[]> {
  return unstable_cache(
    async (): Promise<Release[]> =>
      getAllVisibleReleasesForCalendar(createPublicSupabaseClient(), organizationId).catch(
        () => [] as Release[],
      ),
    ['portal-calendar-releases', organizationId],
    { revalidate: TTL, tags: ['releases', orgTag(organizationId, 'releases')] },
  )()
}

/**
 * Slim portal calendar concerts (past + future, nested artists).
 */
export function getCachedCalendarConcerts(
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Concert[]> {
  return unstable_cache(
    async (): Promise<Concert[]> =>
      getAllVisibleConcertsForCalendar(createPublicSupabaseClient(), organizationId).catch(
        () => [] as Concert[],
      ),
    ['portal-calendar-concerts', organizationId],
    { revalidate: TTL, tags: ['concerts', orgTag(organizationId, 'concerts')] },
  )()
}

/** All public news posts for an organization. */
export function getCachedPublicNews(
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<NewsPost[]> {
  return unstable_cache(
    async (): Promise<NewsPost[]> =>
      getPublicNewsPosts(createPublicSupabaseClient(), organizationId).catch(
        () => [] as NewsPost[],
      ),
    ['public-news', organizationId],
    { revalidate: TTL, tags: ['news', orgTag(organizationId, 'news')] },
  )()
}

/**
 * Returns public videos, optionally excluding YouTube Shorts.
 */
export function getCachedPublicVideos(
  options: { excludeShorts?: boolean; organizationId?: string } = {},
): Promise<Video[]> {
  const organizationId = options.organizationId ?? DEFAULT_ORGANIZATION_ID
  const excludeShorts = options.excludeShorts === true
  return unstable_cache(
    async (): Promise<Video[]> =>
      getPublicVideos(createPublicSupabaseClient(), {
        excludeShorts,
        organizationId,
      }).catch(() => [] as Video[]),
    ['public-videos', organizationId, excludeShorts ? 'no-shorts' : 'all'],
    { revalidate: TTL, tags: ['videos', orgTag(organizationId, 'videos')] },
  )()
}

/** All public concerts for an organization. */
export function getCachedPublicConcerts(
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<Concert[]> {
  return unstable_cache(
    async (): Promise<Concert[]> =>
      getPublicConcerts(createPublicSupabaseClient(), organizationId).catch(() => [] as Concert[]),
    ['public-concerts', organizationId],
    { revalidate: TTL, tags: ['concerts', orgTag(organizationId, 'concerts')] },
  )()
}

/** All public artists (safe columns only) for an organization. */
export function getCachedPublicArtists(
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<PublicArtist[]> {
  return unstable_cache(
    async (): Promise<PublicArtist[]> =>
      getPublicArtists(createPublicSupabaseClient(), organizationId).catch(
        () => [] as PublicArtist[],
      ),
    ['public-artists', organizationId],
    { revalidate: TTL, tags: ['artists', orgTag(organizationId, 'artists')] },
  )()
}

/** Per-organization CMS settings (label name, theme, legal, …). */
export function getCachedSiteSettings(
  organizationId?: string | null,
): Promise<SiteSettings | null> {
  const orgId = organizationId?.trim() || DEFAULT_ORGANIZATION_ID
  return unstable_cache(
    async (): Promise<SiteSettings | null> =>
      getSiteSettings(createPublicSupabaseClient(), orgId).catch(() => null),
    ['public-site-settings', orgId],
    {
      revalidate: TTL,
      tags: ['site-settings', orgTag(orgId, 'site-settings')],
    },
  )()
}
