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
  filterEventImpacts,
  filterLineItemsByPeriod,
  resolvePeriodPreset,
  type AnalyticsFilterState,
  type PeriodPreset,
} from '@/lib/analytics/filterMetrics'
import {
  computeAnalyticsInsights,
  computeAnalyticsKpis,
  matchesQuickSearch,
} from '@/lib/analytics/insights'
import { buildPortalAnalyticsCsv, triggerCsvDownload } from '@/lib/analytics/reportExport'
import {
  buildAnalyticsReportPdf,
  triggerPdfDownload,
} from '@/lib/analytics/analyticsReportPdf'
import {
  saveViewPreferences,
  visibleSosTabIds,
  PORTAL_SOS_ANALYTICS_VIEW_STORAGE_KEY,
} from '@/lib/analytics/viewPreferences'
import { AnalyticsFilters } from './AnalyticsFilters'
import { AnalyticsKpiGrid } from './AnalyticsKpiGrid'
import { AnalyticsInsightsPanel } from './AnalyticsInsightsPanel'
import { AnalyticsToolbar, usePortalAnalyticsPreferences } from './AnalyticsToolbar'
import { AnalyticsHubAssistant } from './AnalyticsHubAssistant'
import { StreamingChart } from './StreamingChart'
import { EarningsChart } from './EarningsChart'
import { EarningsStatementsPanel } from './EarningsStatementsPanel'
import { TerritoriesChart } from './TerritoriesChart'
import { EventImpactChart } from './EventImpactChart'
import { ReleasePerformanceChart } from './ReleasePerformanceChart'
import { RevenueMixChart } from './RevenueMixChart'
import { EpkPressTab } from './EpkPressTab'
import { SettlementTab } from './SettlementTab'
import { PromoImpactChart } from './PromoImpactChart'
import { EngagementTab } from './EngagementTab'
import { MerchTab } from './MerchTab'

interface AnalyticsPageClientProps {
  artistId: string
  artistName: string
  billingProfile: ArtistBillingProfile | null
  billingProfileComplete: boolean
  defaultTab: string
  invoicedStatementIds: string[]
  stats: StreamingStat[]
  statements: SalesStatement[]
  territoryMetrics: ArtistTerritoryMetric[]
  eventImpacts: EventImpact[]
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
  artistName,
  billingProfile,
  billingProfileComplete,
  defaultTab,
  invoicedStatementIds,
  stats,
  statements,
  territoryMetrics,
  eventImpacts,
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
  const [preferences, setPreferences] = usePortalAnalyticsPreferences(
    PORTAL_SOS_ANALYTICS_VIEW_STORAGE_KEY,
  )
  const [pdfExporting, setPdfExporting] = useState(false)

  const periods = useMemo(
    () => collectAvailablePeriods(stats, territoryMetrics, []),
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
      listenerMetrics: [],
      statements,
    }),
    [filteredStats, filteredTerritory, statements],
  )

  // Unfiltered: empty state is about source data, not active period filters
  const hasSosData =
    stats.length > 0 ||
    territoryMetrics.length > 0 ||
    statements.length > 0 ||
    lineItems.length > 0

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

  const insights = useMemo(
    () =>
      computeAnalyticsInsights({
        stats: filteredStats,
        territoryMetrics: filteredTerritory,
        listenerMetrics: [],
        eventImpacts: filteredEventImpacts,
        promoImpacts,
        releaseRows,
        epkStats,
        pressStats,
      }),
    [filteredStats, filteredTerritory, filteredEventImpacts, promoImpacts, releaseRows, epkStats, pressStats],
  )

  const visibleTabs = useMemo(() => visibleSosTabIds(preferences.tabs), [preferences.tabs])
  const activeDefaultTab = visibleTabs.includes(defaultTab as typeof visibleTabs[number])
    ? defaultTab
    : visibleTabs[0] ?? 'streaming'

  const showFilters = periods.length > 0 || platforms.length > 0 || countries.length > 0

  const periodLabel = useMemo(() => {
    if (filters.periodFrom && filters.periodTo) {
      return `${filters.periodFrom} – ${filters.periodTo}`
    }
    if (filters.periodFrom) return `${filters.periodFrom} – …`
    if (filters.periodTo) return `… – ${filters.periodTo}`
    return t('analytics_filter_all')
  }, [filters.periodFrom, filters.periodTo, t])

  const handlePeriodPresetChange = (preset: PeriodPreset) => {
    const next = {
      ...preferences,
      charts: { ...preferences.charts, periodPreset: preset },
    }
    setPreferences(next)
    saveViewPreferences(PORTAL_SOS_ANALYTICS_VIEW_STORAGE_KEY, next)
    if (preset !== 'custom') {
      setFilters((f) => ({ ...f, ...resolvePeriodPreset(periods, preset) }))
    }
  }

  const handleExportCsv = () => {
    const csv = buildPortalAnalyticsCsv({
      stats: filteredStats,
      territoryMetrics: filteredTerritory,
      listenerMetrics: [],
      statements,
    })
    const stamp = new Date().toISOString().slice(0, 10)
    triggerCsvDownload(csv, `sos-analytics-export-${stamp}.csv`)
    toast.success(t('analytics_export_success'))
  }

  const handleExportPdf = async () => {
    setPdfExporting(true)
    try {
      const emptyPresence = {
        kpis: {
          latestListeners: null,
          latestFollowers: null,
          latestPublicTrackPlays: null,
          listenersMomPct: null,
          followersMomPct: null,
          trackCountLatest: 0,
          releaseCountLatest: 0,
          latestPeriod: null,
          latestScrapedAt: null,
          hasAnyData: false,
        },
        trend: [],
        topTracks: [],
        byRelease: [],
        insights: [],
        secondaryListeners: { lastfm: [], soundcharts: [] },
      }
      const blob = await buildAnalyticsReportPdf({
        artistName: artistName || 'Artist',
        periodLabel,
        generatedAt: new Date(),
        kpis,
        presence: emptyPresence,
        platformAggregates: aggregates,
        labels: {
          title: t('sos_analytics_pdf_title'),
          subtitle: t('sos_analytics_pdf_subtitle'),
          period: t('analytics_pdf_period'),
          generated: t('analytics_pdf_generated'),
          kpiStreams: t('analytics_totalStreams'),
          kpiRevenue: t('analytics_kpi_revenue'),
          kpiListeners: t('analytics_presence_kpi_listeners'),
          kpiFollowers: t('analytics_presence_kpi_followers'),
          presenceHeading: t('analytics_presence_heading'),
          topTracks: t('analytics_presence_top_tracks_heading'),
          byRelease: t('analytics_presence_by_release_heading'),
          platforms: t('analytics_heading'),
          colTrack: t('analytics_presence_col_track'),
          colRelease: t('analytics_presence_col_release'),
          colPlays: t('analytics_presence_col_plays'),
          colShare: t('analytics_presence_col_share'),
          colPlatform: t('analytics_filter_platform'),
          colStreams: t('analytics_totalStreams'),
          noData: t('analytics_presence_noData'),
          disclaimer: t('analytics_pdf_disclaimer'),
        },
      })
      const stamp = new Date().toISOString().slice(0, 10)
      triggerPdfDownload(blob, `sos-analytics-${stamp}.pdf`)
      toast.success(t('analytics_export_pdf_success'))
    } catch {
      toast.error(t('analytics_export_pdf_error'))
    } finally {
      setPdfExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold">{t('sos_analytics_heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('sos_analytics_subheading')}</p>
      </div>

      <AnalyticsHubAssistant />

      <AnalyticsToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onExportCsv={handleExportCsv}
        onExportPdf={() => void handleExportPdf()}
        pdfExporting={pdfExporting}
        storageKey={PORTAL_SOS_ANALYTICS_VIEW_STORAGE_KEY}
        hub="sos"
        helpHref="/portal/help#sos-analytics"
      />

      {!hasSosData ? (
        <div className="rounded-lg border border-border bg-card/60 p-6 space-y-2">
          <p className="font-medium">{t('sos_analytics_empty_title')}</p>
          <p className="text-sm text-muted-foreground">{t('sos_analytics_empty_body')}</p>
        </div>
      ) : (
        <AnalyticsKpiGrid kpis={kpis} />
      )}

      {insights.length > 0 && <AnalyticsInsightsPanel insights={insights} />}

      {showFilters && (
        <AnalyticsFilters
          filters={filters}
          periods={periods}
          platforms={platforms}
          countries={countries}
          periodPreset={preferences.charts.periodPreset}
          onChange={setFilters}
          onPeriodPresetChange={handlePeriodPresetChange}
        />
      )}

      <Tabs defaultValue={activeDefaultTab} className="space-y-6">
        <TabsList className="bg-card border border-border flex-wrap h-auto w-full justify-start gap-1 p-1">
          {visibleTabs.includes('streaming') && (
            <TabsTrigger value="streaming">{t('analytics_tab_streaming')}</TabsTrigger>
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
          <TabsContent value="streaming" className="mt-0 space-y-6">
            <StreamingChart
              stats={filteredStats}
              aggregates={aggregates}
              concerts={concerts}
            />
          </TabsContent>
        )}

        {visibleTabs.includes('territories') && (
          <TabsContent value="territories" className="mt-0 space-y-6">
            <h2 className="text-xl font-semibold">{t('analytics_territories_heading')}</h2>
            <TerritoriesChart countries={countryAggregates} />
          </TabsContent>
        )}

        {visibleTabs.includes('events') && (
          <TabsContent value="events" className="mt-0 space-y-6">
            <h2 className="text-xl font-semibold">{t('analytics_eventImpact_heading')}</h2>
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
          <TabsContent value="releases" className="mt-0 space-y-6">
            <ReleasePerformanceChart rows={releaseRows} />
          </TabsContent>
        )}

        {visibleTabs.includes('revenue-mix') && (
          <TabsContent value="revenue-mix" className="mt-0 space-y-6">
            <RevenueMixChart slices={revenueMixSlices} />
          </TabsContent>
        )}

        {visibleTabs.includes('press') && (
          <TabsContent value="press" className="mt-0 space-y-6">
            <EpkPressTab epkStats={epkStats} pressStats={pressStats} />
          </TabsContent>
        )}

        {statementsEnabled && visibleTabs.includes('settlement') && (
          <TabsContent value="settlement" className="mt-0 space-y-6">
            <SettlementTab summary={settlementSummary} />
          </TabsContent>
        )}

        {visibleTabs.includes('engagement') && (
          <TabsContent value="engagement" className="mt-0 space-y-6">
            <EngagementTab stats={engagementStats} />
          </TabsContent>
        )}

        {visibleTabs.includes('merch') && (
          <TabsContent value="merch" className="mt-0 space-y-6">
            <MerchTab stats={merchStats} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
