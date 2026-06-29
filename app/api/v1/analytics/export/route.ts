import { NextResponse } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { withPartnerAuth } from '@/lib/partner-api/withPartnerAuth'
import { buildPortalAnalyticsCsv } from '@/lib/analytics/reportExport'
import { getStreamingStatsByArtistId } from '@/lib/api/streamingStats'
import { getTerritoryMetricsByArtistId } from '@/lib/api/artistTerritoryMetrics'
import { getListenerMetricsByArtistId } from '@/lib/api/artistListenerMetrics'
import { getSalesStatementsByArtistId } from '@/lib/api/salesStatements'

export const GET = withPartnerAuth(async (req, auth) => {
  const artistId = new URL(req.url).searchParams.get('artistId')
  const format = new URL(req.url).searchParams.get('format') ?? 'csv'
  if (!artistId) {
    return NextResponse.json({ error: 'artistId is required' }, { status: 400 })
  }

  const db = await createServiceRoleSupabaseClient()
  const { data: artist } = await db
    .from('artists')
    .select('id')
    .eq('id', artistId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle()

  if (!artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
  }

  const [stats, territoryMetrics, listenerMetrics, statements] = await Promise.all([
    getStreamingStatsByArtistId(db, artistId),
    getTerritoryMetricsByArtistId(db, artistId),
    getListenerMetricsByArtistId(db, artistId),
    getSalesStatementsByArtistId(db, artistId),
  ])

  if (format === 'json') {
    return NextResponse.json({ stats, territoryMetrics, listenerMetrics, statements })
  }

  const csv = buildPortalAnalyticsCsv({ stats, territoryMetrics, listenerMetrics, statements })
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="analytics-${artistId}-${stamp}.csv"`,
    },
  })
})