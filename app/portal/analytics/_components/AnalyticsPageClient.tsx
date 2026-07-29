'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StreamingStat } from '@/lib/api/streamingStats'
import { getAggregatedStreamsByPlatform } from '@/lib/api/streamingStats'
import type { ArtistTerritoryMetric } from '@/lib/api/artistTerritoryMetrics'
import { aggregateMetricsByCountry } from '@/lib/api/artistTerritoryMetrics'
import type { EventImpact } from '@/lib/api/eventImpact'
import type { ArtistListenerMetric } from '@/lib/api/artistListenerMetrics'
import type { SpotifyTrackPlaySnapshot } from '@/lib/api/spotifyTrackPlaySnapshots'
import {
  buildPublicSpotifyPresenceModel,
  filterTrackPlaySnapshots,
} from '@/lib/analytics/publicSpotifyPresence'
import type { ArtistBillingProfile } from '@/lib/api/artistBillingProfiles'
import type { SalesStatement } from '@/lib/api/salesStatements'
import type { ArtistLineItemWithContext } from '@/lib/api/salesStatementLineItems'
import type { EpkDownloadStats } from '@/lib/api/epkDownloadEvents'
import type { ArtistPressDownloadStats } from '@/lib/api/journalistDownloads'
import type { PromoImpact } from '@/lib/api/promoImpact'
import type { ArtistSettlementSummary } from '@/lib/api/settlementLedger'
import type { PageEngagementStats } from '@/lib/api/pageEvents'
import type { MerchOrderStats } from '@/lib/api/merchOrders'
import type { Concert, PromoLogEntry } from '@/types'
import { aggregateReleasePerformance } from '@/lib/analytics/releasePerformance'
import { computeRevenueMix } from '@/lib/analytics/revenueMix'
import {
  EMPTY_ANALYTICS_FILTER,
  collectAvailablePeriods,
  collectAvailablePlatforms,
  collectAvailableCountries,
  filterStreamingStats,
  filterTerritoryMetrics,
  filterListenerMetrics,
  filterEventImpacts,
  filterLineItemsByPeriod,
  type AnalyticsFilterState,
} from '@/lib/analytics/filterMetrics'
import {
  computeAnalyticsInsights,
  computeAnalyticsKpis,
  matchesQuickSearch,
} from '@/lib/analytics/insights'
import { buildPortalAnalyticsCsv, triggerCsvDownload } from '@/lib/analytics/reportExport'
import { visibleTabIds } from '@/lib/analytics/viewPreferences'
import { AnalyticsFilters } from './AnalyticsFilters'
import { AnalyticsKpiGrid } from './AnalyticsKpiGrid'
import { AnalyticsInsightsPanel } from './AnalyticsInsightsPanel'
import { AnalyticsToolbar, usePortalTabVisibility } from './AnalyticsToolbar'
import { StreamingChart } from './StreamingChart'
import { EarningsChart } from './EarningsChart'
import { EarningsStatementsPanel } from './EarningsStatementsPanel'
import { TerritoriesChart } from './TerritoriesChart'
import { EventImpactChart } from './EventImpactChart'
import { SpotifyPresencePanel } from './SpotifyPresencePanel'
import { ReleasePerformanceChart } from './ReleasePerformanceChart'
import { RevenueMixChart } from './RevenueMixChart'
import { EpkPressTab } from './EpkPressTab'
import { SettlementTab } from './SettlementTab'
import { PromoImpactChart } from './PromoImpactChart'
import { EngagementTab } from './EngagementTab'
import { MerchTab } from './MerchTab'

interface AnalyticsPageClientProps {
  artistId: string
  billingProfile: ArtistBillingProfile | null
  billingProfileComplete: boolean
  defaultTab: string
  invoicedStatementIds: string[]
  stats: StreamingStat[]
  statements: SalesStatement[]
  territoryMetrics: ArtistTerritoryMetric[]
  eventImpacts: EventImpact[]
  listenerMetrics: ArtistListenerMetric[]
  trackSnapshots: SpotifyTrackPlaySnapshot[]
  releaseTitles: Record<string, string>
  concerts: Concert[]
  lineItems: ArtistLineItemWithContext[]
  epkStats: EpkDownloadStats
  pressStats: ArtistPressDownloadStats
  promoImpacts: PromoImpact[]
  promoEntries: PromoLogEntry[]
  settlementSummary: ArtistSettlementSummary
  engagementStats: PageEngagementStats
  merchStats: MerchOrderStats
  statementsEnabled: boolean
}

export function AnalyticsPageClient({
  artistId,
  billingProfile,
  billingProfileComplete,
  defaultTab,
  invoicedStatementIds,
  stats,
  statements,
  territoryMetrics,
  eventImpacts,
  listenerMetrics,
  trackSnapshots,
  releaseTitles,
  concerts,
  lineItems,
  epkStats,
  pressStats,
  promoImpacts,
  promoEntries,
  settlementSummary,
  engagementStats,
  merchStats,
  statementsEnabled,
}: AnalyticsPageClientProps) {
  const t = useTranslations('portal')

  const [filters, setFilters] = useState<AnalyticsFilterState>(EMPTY_ANALYTICS_FILTER)
  const [searchQuery, setSearchQuery] = useState('')
  const [tabVisibility, setTabVisibility] = usePortalTabVisibility()

  const periods = useMemo(
    () => collectAvailablePeriods(stats, territoryMetrics),
    [stats, territoryMetrics],
  )
  const platforms = useMemo(
    () => collectAvailablePlatforms(stats, territoryMetrics),
    [stats, territoryMetrics],
  )
  const countries = useMemo(
    () => collectAvailableCountries(territoryMetrics),
    [territoryMetrics],
  )

  const filteredStats = useMemo(() => {
    const byFilter = filterStreamingStats(stats, filters)
    if (!searchQuery.trim()) return byFilter
    return byFilter.filter((s) =>
      matchesQuickSearch(searchQuery, s.period, s.platform, s.streams),
    )
  }, [stats, filters, searchQuery])

  const filteredTerritory = useMemo(() => {
    const byFilter = filterTerritoryMetrics(territoryMetrics, filters)
    if (!searchQuery.trim()) return byFilter
    return byFilter.filter((m) =>
      matchesQuickSearch(searchQuery, m.period, m.platform, m.country, m.streams, m.revenueEur),
    )
  }, [territoryMetrics, filters, searchQuery])

  const filteredListeners = useMemo(() => {
    const byFilter = filterListenerMetrics(listenerMetrics, filters)
    if (!searchQuery.trim()) return byFilter
    return byFilter.filter((m) =>
      matchesQuickSearch(searchQuery, m.period, m.source, m.metricType, m.value, m.country),
    )
  }, [listenerMetrics, filters, searchQuery])

  const filteredTrackSnapshots = useMemo(
    () => filterTrackPlaySnapshots(trackSnapshots, filters.periodFrom, filters.periodTo),
    [trackSnapshots, filters.periodFrom, filters.periodTo],
  )

  const aggregates = useMemo(
    () => getAggregatedStreamsByPlatform(filteredStats),
    [filteredStats],
  )
  const countryAggregates = useMemo(
    () => aggregateMetricsByCountry(filteredTerritory),
    [filteredTerritory],
  )

  const kpis = useMemo(
    () => computeAnalyticsKpis({
      stats: filteredStats,
      territoryMetrics: filteredTerritory,
      listenerMetrics: filteredListeners,
      statements,
    }),
    [filteredStats, filteredTerritory, filteredListeners, statements],
  )

  const filteredLineItems = useMemo(
    () => filterLineItemsByPeriod(lineItems, filters),
    [lineItems, filters],
  )

  const filteredEventImpacts = useMemo(
    () => filterEventImpacts(eventImpacts, filters),
    [eventImpacts, filters],
  )

  const releaseRows = useMemo(
    () => aggregateReleasePerformance(filteredLineItems),
    [filteredLineItems],
  )

  const revenueMixSlices = useMemo(
    () => computeRevenueMix(filteredTerritory),
    [filteredTerritory],
  )

  const publicPresence = useMemo(
    () =>
      buildPublicSpotifyPresenceModel({
        listenerMetrics: filteredListeners,
        trackSnapshots: filteredTrackSnapshots,
        releaseTitles,
        sosStats: filteredStats,
      }),
    [filteredListeners, filteredTrackSnapshots, releaseTitles, filteredStats],
  )

  const insights = useMemo(
    () => [
      ...computeAnalyticsInsights({
        stats: filteredStats,
        territoryMetrics: filteredTerritory,
        listenerMetrics: filteredListeners,
        eventImpacts: filteredEventImpacts,
        promoImpacts,
        releaseRows,
        epkStats,
        pressStats,
      }),
      ...publicPresence.insights,
    ],
    [filteredStats, filteredTerritory, filteredListeners, filteredEventImpacts, promoImpacts, releaseRows, epkStats, pressStats, publicPresence.insights],
  )

  const visibleTabs = useMemo(() => visibleTabIds(tabVisibility), [tabVisibility])
  const activeDefaultTab = visibleTabs.includes(defaultTab as typeof visibleTabs[number])
    ? defaultTab
    : visibleTabs[0] ?? 'streaming'

  const showFilters = periods.length > 0 || platforms.length > 0 || countries.length > 0

  const handleExport = () => {
    const csv = buildPortalAnalyticsCsv({
      stats: filteredStats,
      territoryMetrics: filteredTerritory,
      listenerMetrics: filteredListeners,
      statements,
    })
    const stamp = new Date().toISOString().slice(0, 10)
    triggerCsvDownload(csv, `analytics-export-${stamp}.csv`)
    toast.success(t('analytics_export_success'))
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('analytics_dashboard_heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('analytics_dashboard_subheading')}</p>
      </div>

      <AnalyticsToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        tabVisibility={tabVisibility}
        onTabVisibilityChange={setTabVisibility}
        onExport={handleExport}
      />

      <AnalyticsKpiGrid kpis={kpis} />

      <AnalyticsInsightsPanel insights={insights} />

      {showFilters && (
        <AnalyticsFilters
          filters={filters}
          periods={periods}
          platforms={platforms}
          countries={countries}
          onChange={setFilters}
        />
      )}

      <Tabs defaultValue={activeDefaultTab} className="space-y-6">
        <TabsList className="bg-card border border-border flex-wrap h-auto w-full justify-start">
          {visibleTabs.includes('streaming') && (
            <TabsTrigger value="streaming">{t('analytics_tab_streaming')}</TabsTrigger>
          )}
          {visibleTabs.includes('listeners') && (
            <TabsTrigger value="listeners">{t('analytics_tab_listeners')}</TabsTrigger>
          )}
          {visibleTabs.includes('territories') && (
            <TabsTrigger value="territories">{t('analytics_tab_territories')}</TabsTrigger>
          )}
          {visibleTabs.includes('events') && (
            <TabsTrigger value="events">{t('analytics_tab_events')}</TabsTrigger>
          )}
          {visibleTabs.includes('earnings') && (
            <TabsTrigger value="earnings">{t('analytics_tab_earnings')}</TabsTrigger>
          )}
          {visibleTabs.includes('releases') && (
            <TabsTrigger value="releases">{t('analytics_tab_releases')}</TabsTrigger>
          )}
          {visibleTabs.includes('revenue-mix') && (
            <TabsTrigger value="revenue-mix">{t('analytics_tab_revenue_mix')}</TabsTrigger>
          )}
          {visibleTabs.includes('press') && (
            <TabsTrigger value="press">{t('analytics_tab_press')}</TabsTrigger>
          )}
          {statementsEnabled && visibleTabs.includes('settlement') && (
            <TabsTrigger value="settlement">{t('analytics_tab_settlement')}</TabsTrigger>
          )}
          {visibleTabs.includes('engagement') && (
            <TabsTrigger value="engagement">{t('analytics_tab_engagement')}</TabsTrigger>
          )}
          {visibleTabs.includes('merch') && (
            <TabsTrigger value="merch">{t('analytics_tab_merch')}</TabsTrigger>
          )}
        </TabsList>

        {visibleTabs.includes('streaming') && (
          <TabsContent value="streaming" className="mt-0">
            <StreamingChart
              stats={filteredStats}
              aggregates={aggregates}
              concerts={concerts}
            />
          </TabsContent>
        )}

        {visibleTabs.includes('listeners') && (
          <TabsContent value="listeners" className="mt-0">
            <SpotifyPresencePanel
              metrics={filteredListeners}
              trackSnapshots={filteredTrackSnapshots}
              releaseTitles={releaseTitles}
              sosStats={filteredStats}
            />
          </TabsContent>
        )}

        {visibleTabs.includes('territories') && (
          <TabsContent value="territories" className="mt-0 space-y-4">
            <h2 className="text-2xl font-bold">{t('analytics_territories_heading')}</h2>
            <TerritoriesChart countries={countryAggregates} />
          </TabsContent>
        )}

        {visibleTabs.includes('events') && (
          <TabsContent value="events" className="mt-0 space-y-6">
            <h2 className="text-2xl font-bold">{t('analytics_eventImpact_heading')}</h2>
            <EventImpactChart
              impacts={filteredEventImpacts}
              concerts={concerts}
            />
            <PromoImpactChart
              impacts={promoImpacts}
              promoEntries={promoEntries}
            />
          </TabsContent>
        )}

        {visibleTabs.includes('earnings') && (
          <TabsContent value="earnings" className="mt-0 space-y-6">
            <EarningsChart statements={statements} />
            <EarningsStatementsPanel
              artistId={artistId}
              billingProfile={billingProfile}
              billingProfileComplete={billingProfileComplete}
              invoicedStatementIds={invoicedStatementIds}
              searchQuery={searchQuery}
              statements={statements}
            />
          </TabsContent>
        )}

        {visibleTabs.includes('releases') && (
          <TabsContent value="releases" className="mt-0">
            <ReleasePerformanceChart rows={releaseRows} />
          </TabsContent>
        )}

        {visibleTabs.includes('revenue-mix') && (
          <TabsContent value="revenue-mix" className="mt-0">
            <RevenueMixChart slices={revenueMixSlices} />
          </TabsContent>
        )}

        {visibleTabs.includes('press') && (
          <TabsContent value="press" className="mt-0">
            <EpkPressTab epkStats={epkStats} pressStats={pressStats} />
          </TabsContent>
        )}

        {statementsEnabled && visibleTabs.includes('settlement') && (
          <TabsContent value="settlement" className="mt-0">
            <SettlementTab summary={settlementSummary} />
          </TabsContent>
        )}

        {visibleTabs.includes('engagement') && (
          <TabsContent value="engagement" className="mt-0">
            <EngagementTab stats={engagementStats} />
          </TabsContent>
        )}

        {visibleTabs.includes('merch') && (
          <TabsContent value="merch" className="mt-0">
            <MerchTab stats={merchStats} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}