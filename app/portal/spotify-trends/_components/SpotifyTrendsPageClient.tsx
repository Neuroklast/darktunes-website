'use client'

/**
 * Public Spotify trends dashboard (listeners, followers, track plays).
 * Separate from SOS statement analytics — never mixed into one stream total.
 */

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { ArtistListenerMetric } from '@/lib/api/artistListenerMetrics'
import type { SpotifyTrackPlaySnapshot } from '@/lib/api/spotifyTrackPlaySnapshots'
import type { StreamingStat } from '@/lib/api/streamingStats'
import {
  buildPublicSpotifyPresenceModel,
  filterTrackPlaySnapshots,
} from '@/lib/analytics/publicSpotifyPresence'
import {
  EMPTY_ANALYTICS_FILTER,
  collectAvailablePeriods,
  filterListenerMetrics,
  resolvePeriodPreset,
  type AnalyticsFilterState,
  type PeriodPreset,
} from '@/lib/analytics/filterMetrics'
import {
  saveViewPreferences,
  PORTAL_SPOTIFY_TRENDS_VIEW_STORAGE_KEY,
} from '@/lib/analytics/viewPreferences'
import {
  buildAnalyticsReportPdf,
  triggerPdfDownload,
} from '@/lib/analytics/analyticsReportPdf'
import { AnalyticsFilters } from '../../analytics/_components/AnalyticsFilters'
import { AnalyticsInsightsPanel } from '../../analytics/_components/AnalyticsInsightsPanel'
import {
  AnalyticsToolbar,
  usePortalAnalyticsPreferences,
} from '../../analytics/_components/AnalyticsToolbar'
import { SpotifyPresencePanel } from '../../analytics/_components/SpotifyPresencePanel'
import { Card, CardContent } from '@/components/ui/card'

interface SpotifyTrendsPageClientProps {
  artistName: string
  listenerMetrics: ArtistListenerMetric[]
  trackSnapshots: SpotifyTrackPlaySnapshot[]
  releaseTitles: Record<string, string>
  /** Optional SOS streams for comparison series only — never summed into presence totals */
  sosStats: StreamingStat[]
}

export function SpotifyTrendsPageClient({
  artistName,
  listenerMetrics,
  trackSnapshots,
  releaseTitles,
  sosStats,
}: SpotifyTrendsPageClientProps) {
  const t = useTranslations('portal')
  const [filters, setFilters] = useState<AnalyticsFilterState>(EMPTY_ANALYTICS_FILTER)
  const [preferences, setPreferences] = usePortalAnalyticsPreferences(
    PORTAL_SPOTIFY_TRENDS_VIEW_STORAGE_KEY,
  )
  const [pdfExporting, setPdfExporting] = useState(false)

  const listenerPeriods = useMemo(
    () => listenerMetrics.map((m) => m.period),
    [listenerMetrics],
  )
  const snapshotPeriods = useMemo(
    () => trackSnapshots.map((s) => s.period),
    [trackSnapshots],
  )
  const periods = useMemo(
    () => collectAvailablePeriods([], [], [...listenerPeriods, ...snapshotPeriods]),
    [listenerPeriods, snapshotPeriods],
  )

  const filteredListeners = useMemo(
    () => filterListenerMetrics(listenerMetrics, filters),
    [listenerMetrics, filters],
  )
  const filteredTrackSnapshots = useMemo(
    () => filterTrackPlaySnapshots(trackSnapshots, filters.periodFrom, filters.periodTo),
    [trackSnapshots, filters.periodFrom, filters.periodTo],
  )
  const filteredSosStats = useMemo(() => {
    if (!filters.periodFrom && !filters.periodTo) return sosStats
    return sosStats.filter((s) => {
      if (filters.periodFrom && s.period < filters.periodFrom) return false
      if (filters.periodTo && s.period > filters.periodTo) return false
      return true
    })
  }, [sosStats, filters.periodFrom, filters.periodTo])

  const publicPresence = useMemo(
    () =>
      buildPublicSpotifyPresenceModel({
        listenerMetrics: filteredListeners,
        trackSnapshots: filteredTrackSnapshots,
        releaseTitles,
        sosStats: filteredSosStats,
      }),
    [filteredListeners, filteredTrackSnapshots, releaseTitles, filteredSosStats],
  )

  const hasData = publicPresence.kpis.hasAnyData
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
    saveViewPreferences(PORTAL_SPOTIFY_TRENDS_VIEW_STORAGE_KEY, next)
    if (preset !== 'custom') {
      setFilters((f) => ({ ...f, ...resolvePeriodPreset(periods, preset) }))
    }
  }

  const handleExportPdf = async () => {
    setPdfExporting(true)
    try {
      const blob = await buildAnalyticsReportPdf({
        artistName: artistName || 'Artist',
        periodLabel,
        generatedAt: new Date(),
        kpis: {
          totalStreams: 0,
          totalRevenueEur: 0,
          topPlatform: null,
          topCountry: null,
          periodCount: periods.length,
          streamGrowthPct: null,
          revenueGrowthPct: null,
          listenerCorrelation: null,
          pendingStatements: 0,
          totalEarningsEur: 0,
        },
        presence: publicPresence,
        platformAggregates: [],
        labels: {
          title: t('spotify_trends_pdf_title'),
          subtitle: t('spotify_trends_pdf_subtitle'),
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
      triggerPdfDownload(blob, `spotify-trends-${stamp}.pdf`)
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
        <h1 className="text-2xl sm:text-3xl font-bold">{t('spotify_trends_heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('spotify_trends_subheading')}</p>
      </div>

      <AnalyticsToolbar
        searchQuery=""
        onSearchChange={() => {}}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onExportCsv={undefined}
        onExportPdf={() => void handleExportPdf()}
        pdfExporting={pdfExporting}
        storageKey={PORTAL_SPOTIFY_TRENDS_VIEW_STORAGE_KEY}
        hub="spotify"
        helpHref="/portal/help#spotify-trends"
      />

      {periods.length > 0 && (
        <AnalyticsFilters
          filters={filters}
          periods={periods}
          platforms={[]}
          countries={[]}
          periodPreset={preferences.charts.periodPreset}
          onChange={setFilters}
          onPeriodPresetChange={handlePeriodPresetChange}
        />
      )}

      {!hasData ? (
        <Card className="border-border bg-card/60">
          <CardContent className="p-6 space-y-2">
            <p className="font-medium">{t('spotify_trends_empty_title')}</p>
            <p className="text-sm text-muted-foreground">{t('spotify_trends_empty_body')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {publicPresence.insights.length > 0 && (
            <AnalyticsInsightsPanel insights={publicPresence.insights} />
          )}
          <SpotifyPresencePanel
            metrics={filteredListeners}
            trackSnapshots={filteredTrackSnapshots}
            releaseTitles={releaseTitles}
            sosStats={filteredSosStats}
            chartMode={preferences.charts.presenceMode}
            seriesVisibility={preferences.charts.presenceSeries}
          />
        </>
      )}
    </div>
  )
}
