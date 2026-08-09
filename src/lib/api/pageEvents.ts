/**
 * DAL for consent-gated website page events (page_events table).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

export type PageEventType = 'page_view' | 'shop_click' | 'smart_link_click' | 'news_view'

export interface LogPageEventInput {
  eventType: PageEventType
  path: string
  artistId?: string | null
  newsPostId?: string | null
  releaseId?: string | null
  referrerHost?: string | null
  sessionHash?: string | null
}

export interface PageEngagementStats {
  totalViews: number
  last30DaysViews: number
  shopClicks: number
  last30DaysShopClicks: number
  newsViews: number
  dailyViews: Array<{ date: string; count: number }>
}

export interface LabelPageEngagementStats {
  totalViews: number
  last30DaysViews: number
  shopClicks: number
  topArtists: Array<{ artistId: string; artistName: string; views: number }>
}

export async function logPageEvent(db: DbClient, input: LogPageEventInput): Promise<void> {
  const { error } = await db.from('page_events').insert({
    event_type: input.eventType,
    path: input.path,
    artist_id: input.artistId ?? null,
    news_post_id: input.newsPostId ?? null,
    release_id: input.releaseId ?? null,
    referrer_host: input.referrerHost ?? null,
    session_hash: input.sessionHash ?? null,
  })

  if (error) throw new Error(error.message)
}

export async function getPageEngagementStats(
  db: DbClient,
  artistId: string,
): Promise<PageEngagementStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()

  const { data, error } = await db
    .from('page_events')
    .select('event_type, created_at')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw new Error(error.message)

  const rows = data ?? []
  let totalViews = 0
  let last30DaysViews = 0
  let shopClicks = 0
  let last30DaysShopClicks = 0
  let newsViews = 0
  const dailyMap = new Map<string, number>()

  for (const row of rows) {
    const isRecent = row.created_at >= thirtyDaysAgo
    const day = row.created_at.slice(0, 10)

    if (row.event_type === 'page_view') {
      totalViews += 1
      if (isRecent) {
        last30DaysViews += 1
        dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1)
      }
    } else if (row.event_type === 'shop_click') {
      shopClicks += 1
      if (isRecent) last30DaysShopClicks += 1
    } else if (row.event_type === 'news_view') {
      newsViews += 1
    }
  }

  const dailyViews = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  return {
    totalViews,
    last30DaysViews,
    shopClicks,
    last30DaysShopClicks,
    newsViews,
    dailyViews,
  }
}

export async function getLabelPageEngagementStats(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<LabelPageEngagementStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()

  const artistsRes = await db
    .from('artists')
    .select('id, name')
    .eq('organization_id', organizationId)
  if (artistsRes.error) throw new Error(artistsRes.error.message)

  const orgArtistIds = new Set((artistsRes.data ?? []).map((a) => a.id))
  if (orgArtistIds.size === 0) {
    return {
      totalViews: 0,
      last30DaysViews: 0,
      shopClicks: 0,
      topArtists: [],
    }
  }

  const eventsRes = await db
    .from('page_events')
    .select('artist_id, event_type, created_at')
    .not('artist_id', 'is', null)
    .in('artist_id', [...orgArtistIds])
    .order('created_at', { ascending: false })
    .limit(10000)

  if (eventsRes.error) throw new Error(eventsRes.error.message)

  const artistNames = new Map((artistsRes.data ?? []).map((a) => [a.id, a.name]))
  const viewsByArtist = new Map<string, number>()

  let totalViews = 0
  let last30DaysViews = 0
  let shopClicks = 0

  for (const row of eventsRes.data ?? []) {
    if (!row.artist_id || !orgArtistIds.has(row.artist_id)) continue
    if (row.event_type === 'page_view') {
      totalViews += 1
      viewsByArtist.set(row.artist_id, (viewsByArtist.get(row.artist_id) ?? 0) + 1)
      if (row.created_at >= thirtyDaysAgo) last30DaysViews += 1
    } else if (row.event_type === 'shop_click') {
      shopClicks += 1
    }
  }

  const topArtists = [...viewsByArtist.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([artistId, views]) => ({
      artistId,
      artistName: artistNames.get(artistId) ?? 'Unknown',
      views,
    }))

  return { totalViews, last30DaysViews, shopClicks, topArtists }
}