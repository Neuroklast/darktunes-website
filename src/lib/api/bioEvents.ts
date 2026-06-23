/**
 * src/lib/api/bioEvents.ts — press EPK view / copy / download analytics.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { PressLocale } from './artistProfiles'
import type { BioDownloadFormat, BioDownloadTier } from '@/lib/press/bioAssetKey'

type DbClient = SupabaseClient<Database>
type BioEventRow = Database['public']['Tables']['artist_bio_events']['Row']
type BioEventInsert = Database['public']['Tables']['artist_bio_events']['Insert']

export type BioEventType = 'view' | 'copy' | 'download'

export interface BioEvent {
  id: string
  artistId: string
  journalistId: string | undefined
  eventType: BioEventType
  locale: PressLocale | undefined
  tier: BioDownloadTier | undefined
  format: BioDownloadFormat | undefined
  createdAt: string
}

export interface LogBioEventInput {
  artistId: string
  eventType: BioEventType
  journalistId?: string | null
  locale?: PressLocale
  tier?: BioDownloadTier
  format?: BioDownloadFormat
}

export interface BioEventArtistStat {
  artistId: string
  artistName: string
  count: number
}

export interface BioEventJournalistStat {
  journalistId: string
  count: number
}

export interface BioEventAnalytics {
  totalViews: number
  totalCopies: number
  totalDownloads: number
  topArtistsByViews: BioEventArtistStat[]
  downloadsByJournalist: BioEventJournalistStat[]
}

function rowToBioEvent(row: BioEventRow): BioEvent {
  return {
    id: row.id,
    artistId: row.artist_id,
    journalistId: row.journalist_id ?? undefined,
    eventType: row.event_type,
    locale: row.locale ?? undefined,
    tier: row.tier ?? undefined,
    format: row.format ?? undefined,
    createdAt: row.created_at,
  }
}

function toInsert(input: LogBioEventInput): BioEventInsert {
  return {
    artist_id: input.artistId,
    journalist_id: input.journalistId ?? null,
    event_type: input.eventType,
    locale: input.locale ?? null,
    tier: input.tier ?? null,
    format: input.format ?? null,
  }
}

export async function logBioEvent(db: DbClient, input: LogBioEventInput): Promise<BioEvent> {
  const { data: row, error } = await db
    .from('artist_bio_events')
    .insert(toInsert(input))
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('No data returned from logBioEvent')
  return rowToBioEvent(row)
}

async function countEventsByType(db: DbClient, eventType: BioEventType): Promise<number> {
  const { count, error } = await db
    .from('artist_bio_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType)
  if (error) throw new Error(error.message)
  return count ?? 0
}

function aggregateCounts<T extends string>(
  rows: Array<Record<string, T | null>>,
  key: keyof (typeof rows)[number],
  limit = 10,
): Array<{ id: string; count: number }> {
  const tally = new Map<string, number>()
  for (const row of rows) {
    const value = row[key]
    if (!value) continue
    tally.set(value, (tally.get(value) ?? 0) + 1)
  }
  return [...tally.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export async function getBioEventAnalytics(db: DbClient): Promise<BioEventAnalytics> {
  const [totalViews, totalCopies, totalDownloads, viewRows, downloadRows] = await Promise.all([
    countEventsByType(db, 'view'),
    countEventsByType(db, 'copy'),
    countEventsByType(db, 'download'),
    db
      .from('artist_bio_events')
      .select('artist_id')
      .eq('event_type', 'view')
      .order('created_at', { ascending: false })
      .limit(5000)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        return data ?? []
      }),
    db
      .from('artist_bio_events')
      .select('journalist_id')
      .eq('event_type', 'download')
      .not('journalist_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        return data ?? []
      }),
  ])

  const topArtistIds = aggregateCounts(viewRows, 'artist_id')
  const artistNameById = new Map<string, string>()
  if (topArtistIds.length > 0) {
    const { data: artists, error } = await db
      .from('artists')
      .select('id, name')
      .in(
        'id',
        topArtistIds.map((item) => item.id),
      )
    if (error) throw new Error(error.message)
    for (const artist of artists ?? []) {
      artistNameById.set(artist.id, artist.name)
    }
  }

  return {
    totalViews,
    totalCopies,
    totalDownloads,
    topArtistsByViews: topArtistIds.map((item) => ({
      artistId: item.id,
      artistName: artistNameById.get(item.id) ?? 'Unknown artist',
      count: item.count,
    })),
    downloadsByJournalist: aggregateCounts(downloadRows, 'journalist_id').map((item) => ({
      journalistId: item.id,
      count: item.count,
    })),
  }
}