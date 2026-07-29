/**
 * app/portal/analytics/page.tsx — Portal Analytics (Server Component)
 *
 * Fetches streaming stats, territory metrics, event impact, concerts,
 * and royalty statements server-side and passes aggregated data to chart leaves.
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getStreamingStatsByArtistId } from '@/lib/api/streamingStats'
import { getTerritoryMetricsByArtistId } from '@/lib/api/artistTerritoryMetrics'
import { getEventImpactByArtistId } from '@/lib/api/eventImpact'
import { getListenerMetricsByArtistId } from '@/lib/api/artistListenerMetrics'
import { getTrackPlaySnapshotsByArtistId } from '@/lib/api/spotifyTrackPlaySnapshots'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getBillingProfile, isBillingProfileComplete } from '@/lib/api/artistBillingProfiles'
import { listArtistInvoices } from '@/lib/api/artistInvoices'
import { getSalesStatementsByArtistId } from '@/lib/api/salesStatements'
import { getLineItemsByArtistId } from '@/lib/api/salesStatementLineItems'
import { getEpkDownloadStats } from '@/lib/api/epkDownloadEvents'
import { getPressDownloadStatsByArtistId } from '@/lib/api/journalistDownloads'
import { getPromoImpactByArtistId } from '@/lib/api/promoImpact'
import { getPromoLogEntries } from '@/lib/api/promoLog'
import { getArtistSettlementSummary } from '@/lib/api/settlementLedger'
import { getPageEngagementStats } from '@/lib/api/pageEvents'
import { getMerchOrdersByArtistId, computeMerchOrderStats } from '@/lib/api/merchOrders'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalyticsPageClient } from './_components/AnalyticsPageClient'
import { getTranslations } from 'next-intl/server'

function AnalyticsSkeleton() {


  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

async function AnalyticsContent({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string; tab?: string }>
}) {

  const t = await getTranslations('portal')

  const { artistId, tab } = await searchParams

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const flags = await getFeatureFlagsForRole(supabase, 'artist').catch(() => ({} as Record<string, boolean>))
  if (flags['artist.analytics'] === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('analytics_dashboard_heading')}</h1>
        <p className="text-muted-foreground">{t('analytics_unavailable')}</p>
      </div>
    )
  }

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)

  const [
    stats,
    statements,
    territoryMetrics,
    eventImpacts,
    listenerMetrics,
    concerts,
    billingProfile,
    invoiceList,
    lineItems,
    epkStats,
    pressStats,
    promoImpacts,
    promoEntries,
    settlementSummary,
    engagementStats,
    merchOrders,
    trackSnapshots,
    releases,
  ] = await Promise.all([
    artist ? getStreamingStatsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist ? getSalesStatementsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist ? getTerritoryMetricsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist ? getEventImpactByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist ? getListenerMetricsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist ? getConcertsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist ? getBillingProfile(supabase, artist.id).catch(() => null) : Promise.resolve(null),
    artist
      ? listArtistInvoices(supabase, artist.id, 1, 200).catch(() => ({ invoices: [], total: 0 }))
      : Promise.resolve({ invoices: [], total: 0 }),
    artist ? getLineItemsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist
      ? getEpkDownloadStats(supabase, artist.id).catch(() => ({
          total: 0,
          last30Days: 0,
          bySource: { portal: 0, share: 0, press: 0 },
        }))
      : Promise.resolve({
          total: 0,
          last30Days: 0,
          bySource: { portal: 0, share: 0, press: 0 },
        }),
    artist
      ? getPressDownloadStatsByArtistId(supabase, artist.id).catch(() => ({
          totalDownloads: 0,
          last30Days: 0,
          uniqueJournalists: 0,
          recentDownloads: [],
        }))
      : Promise.resolve({
          totalDownloads: 0,
          last30Days: 0,
          uniqueJournalists: 0,
          recentDownloads: [],
        }),
    artist ? getPromoImpactByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist ? getPromoLogEntries(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist && flags['artist.statements'] !== false
      ? getArtistSettlementSummary(supabase, artist.id).catch(() => ({
          balanceEur: 0,
          recentEntries: [],
          latestCarryForwardEur: null,
        }))
      : Promise.resolve({
          balanceEur: 0,
          recentEntries: [],
          latestCarryForwardEur: null,
        }),
    artist
      ? getPageEngagementStats(supabase, artist.id).catch(() => ({
          totalViews: 0,
          last30DaysViews: 0,
          shopClicks: 0,
          last30DaysShopClicks: 0,
          newsViews: 0,
          dailyViews: [],
        }))
      : Promise.resolve({
          totalViews: 0,
          last30DaysViews: 0,
          shopClicks: 0,
          last30DaysShopClicks: 0,
          newsViews: 0,
          dailyViews: [],
        }),
    artist ? getMerchOrdersByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist
      ? getTrackPlaySnapshotsByArtistId(supabase, artist.id).catch(() => [])
      : Promise.resolve([]),
    artist ? getReleasesByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
  ])

  const merchStats = computeMerchOrderStats(merchOrders)
  const releaseTitles: Record<string, string> = {}
  for (const r of releases) {
    releaseTitles[r.id] = r.title
  }

  const validTabs = new Set([
    'streaming',
    'listeners',
    'territories',
    'events',
    'earnings',
    'releases',
    'revenue-mix',
    'press',
    'settlement',
    'engagement',
    'merch',
  ])
  const defaultTab = tab && validTabs.has(tab) ? tab : 'streaming'

  return (
    <AnalyticsPageClient
      artistId={artist?.id ?? ''}
      billingProfile={billingProfile}
      billingProfileComplete={isBillingProfileComplete(billingProfile)}
      defaultTab={defaultTab}
      invoicedStatementIds={invoiceList.invoices.flatMap((invoice) =>
        invoice.statementId ? [invoice.statementId] : [],
      )}
      stats={stats}
      statements={statements}
      territoryMetrics={territoryMetrics}
      eventImpacts={eventImpacts}
      listenerMetrics={listenerMetrics}
      trackSnapshots={trackSnapshots}
      releaseTitles={releaseTitles}
      concerts={concerts}
      lineItems={lineItems}
      epkStats={epkStats}
      pressStats={pressStats}
      promoImpacts={promoImpacts}
      promoEntries={promoEntries}
      settlementSummary={settlementSummary}
      engagementStats={engagementStats}
      merchStats={merchStats}
      statementsEnabled={flags['artist.statements'] !== false}
    />
  )
}

export default function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string; tab?: string }>
}) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent searchParams={searchParams} />
    </Suspense>
  )
}