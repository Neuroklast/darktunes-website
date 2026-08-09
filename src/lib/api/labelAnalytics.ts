/**
 * Label-wide analytics queries for the admin intelligence hub.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { SosPeriodSummary } from '@/lib/api/sosPeriodSummaries'
import { listSosPeriodSummaries } from '@/lib/api/sosPeriodSummaries'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

type DbClient = SupabaseClient<Database>

export interface RosterHealthRow {
  artistId: string
  artistName: string
  totalStreams: number
  latestPeriod: string | null
  latestPeriodStreams: number
  streamGrowthPct: number | null
  totalRevenueEur: number
  openStatements: number
}

export interface LabelAnalyticsSnapshot {
  periodSummaries: SosPeriodSummary[]
  rosterHealth: RosterHealthRow[]
  totalLabelStreams: number
  totalLabelRevenue: number
  artistCountWithData: number
}

function growthBetweenPeriods(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 10000) / 100
}

export async function getRosterHealthMetrics(db: DbClient): Promise<RosterHealthRow[]> {
  const [artistsRes, streamsRes, territoryRes, statementsRes] = await Promise.all([
    db.from('artists').select('id, name').eq('is_visible', true).order('name'),
    db.from('streaming_stats').select('artist_id, period, streams'),
    db.from('artist_territory_metrics').select('artist_id, revenue_eur'),
    db
      .from('sales_statements')
      .select('artist_id, status')
      .in('status', ['draft', 'label_approved', 'artist_notified']),
  ])

  if (artistsRes.error) throw new Error(artistsRes.error.message)
  if (streamsRes.error) throw new Error(streamsRes.error.message)
  if (territoryRes.error) throw new Error(territoryRes.error.message)
  if (statementsRes.error) throw new Error(statementsRes.error.message)

  const streamsByArtist = new Map<string, Map<string, number>>()
  for (const row of streamsRes.data ?? []) {
    const periods = streamsByArtist.get(row.artist_id) ?? new Map<string, number>()
    periods.set(row.period, (periods.get(row.period) ?? 0) + row.streams)
    streamsByArtist.set(row.artist_id, periods)
  }

  const revenueByArtist = new Map<string, number>()
  for (const row of territoryRes.data ?? []) {
    revenueByArtist.set(
      row.artist_id,
      (revenueByArtist.get(row.artist_id) ?? 0) + Number(row.revenue_eur),
    )
  }

  const openStatementsByArtist = new Map<string, number>()
  for (const row of statementsRes.data ?? []) {
    openStatementsByArtist.set(
      row.artist_id,
      (openStatementsByArtist.get(row.artist_id) ?? 0) + 1,
    )
  }

  const rows: RosterHealthRow[] = []

  for (const artist of artistsRes.data ?? []) {
    const periodMap = streamsByArtist.get(artist.id)
    const periods = periodMap ? [...periodMap.keys()].sort() : []
    const totalStreams = periodMap
      ? [...periodMap.values()].reduce((sum, v) => sum + v, 0)
      : 0

    const latestPeriod = periods.length > 0 ? periods[periods.length - 1]! : null
    const prevPeriod = periods.length > 1 ? periods[periods.length - 2]! : null
    const latestPeriodStreams = latestPeriod ? (periodMap?.get(latestPeriod) ?? 0) : 0
    const prevPeriodStreams = prevPeriod ? (periodMap?.get(prevPeriod) ?? 0) : 0

    const hasData =
      totalStreams > 0 ||
      (revenueByArtist.get(artist.id) ?? 0) > 0 ||
      (openStatementsByArtist.get(artist.id) ?? 0) > 0

    if (!hasData) continue

    rows.push({
      artistId: artist.id,
      artistName: artist.name,
      totalStreams,
      latestPeriod,
      latestPeriodStreams,
      streamGrowthPct:
        latestPeriod && prevPeriod
          ? growthBetweenPeriods(latestPeriodStreams, prevPeriodStreams)
          : null,
      totalRevenueEur: revenueByArtist.get(artist.id) ?? 0,
      openStatements: openStatementsByArtist.get(artist.id) ?? 0,
    })
  }

  return rows.sort((a, b) => b.totalRevenueEur - a.totalRevenueEur)
}

export async function getLabelAnalyticsSnapshot(
  db: DbClient,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
): Promise<LabelAnalyticsSnapshot> {
  const [periodSummaries, rosterHealth] = await Promise.all([
    listSosPeriodSummaries(db, organizationId).catch(() => []),
    getRosterHealthMetrics(db).catch(() => []),
  ])

  const totalLabelStreams = rosterHealth.reduce((sum, r) => sum + r.totalStreams, 0)
  const totalLabelRevenue = rosterHealth.reduce((sum, r) => sum + r.totalRevenueEur, 0)

  return {
    periodSummaries,
    rosterHealth,
    totalLabelStreams,
    totalLabelRevenue,
    artistCountWithData: rosterHealth.length,
  }
}