'use client'

/**
 * Public Spotify presence (listeners, followers, track plays).
 * Separate from SOS statement streams. Never names scrape vendors.
 */

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import type { ArtistListenerMetric } from '@/lib/api/artistListenerMetrics'
import type { SpotifyTrackPlaySnapshot } from '@/lib/api/spotifyTrackPlaySnapshots'
import type { StreamingStat } from '@/lib/api/streamingStats'
import {
  buildPublicSpotifyPresenceModel,
  type PublicSpotifyPresenceModel,
} from '@/lib/analytics/publicSpotifyPresence'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, UserPlus, PlayCircle, Disc } from '@phosphor-icons/react'
import {
  horizontalScrollClass,
} from '@/components/ui/scroll-panel'
import { cn } from '@/lib/utils'
import { portalKey } from '@/i18n/portalKey'
import { PublicMetricsDisclaimer } from './PublicMetricsDisclaimer'

export interface SpotifyPresencePanelInnerProps {
  model: PublicSpotifyPresenceModel
  chartMode?: import('@/lib/analytics/presenceChartUtils').PresenceChartMode
  seriesVisibility?: import('@/lib/analytics/viewPreferences').PresenceSeriesVisibility
}

interface SpotifyPresencePanelProps {
  metrics: ArtistListenerMetric[]
  trackSnapshots: SpotifyTrackPlaySnapshot[]
  releaseTitles: Record<string, string>
  sosStats: StreamingStat[]
  chartMode?: import('@/lib/analytics/presenceChartUtils').PresenceChartMode
  seriesVisibility?: import('@/lib/analytics/viewPreferences').PresenceSeriesVisibility
}

const SpotifyPresencePanelInner = dynamic(
  () => import('./SpotifyPresencePanelInner').then((m) => m.SpotifyPresencePanelInner),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    ),
  },
)

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return new Intl.NumberFormat().format(n)
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export function SpotifyPresencePanel({
  metrics,
  trackSnapshots,
  releaseTitles,
  sosStats,
  chartMode = 'absolute',
  seriesVisibility,
}: SpotifyPresencePanelProps) {
  const t = useTranslations('portal')

  const model = useMemo(
    () =>
      buildPublicSpotifyPresenceModel({
        listenerMetrics: metrics,
        trackSnapshots,
        releaseTitles,
        sosStats,
      }),
    [metrics, trackSnapshots, releaseTitles, sosStats],
  )

  if (!model.kpis.hasAnyData) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{t('analytics_presence_heading')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('analytics_presence_hint')}</p>
        </div>
        <PublicMetricsDisclaimer />
        <p className="text-muted-foreground">{t('analytics_presence_noData')}</p>
      </div>
    )
  }

  const { kpis } = model

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold">{t('analytics_presence_heading')}</h2>
          <p className="text-sm text-muted-foreground">{t('analytics_presence_hint')}</p>
        </div>
        <Badge
          variant="outline"
          className="text-xs font-normal shrink-0 border-amber-400/50 text-amber-100 bg-amber-950"
        >
          {t('analytics_presence_source_badge')}
        </Badge>
      </div>

      <PublicMetricsDisclaimer />

      {!model.currentPeriodHasPublicData && (
        <p className="text-xs text-muted-foreground" role="status">
          {t('analytics_presence_current_month_pending', { period: model.currentPeriod })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border min-w-0">
          <CardHeader className="px-5 pb-2 pt-5">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <Users size={14} aria-hidden="true" />
              {t('analytics_presence_kpi_listeners')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-bold tabular-nums">
              {kpis.latestListeners !== null ? fmtNum(kpis.latestListeners) : '—'}
            </p>
            {kpis.listenersMomPct !== null && (
              <p
                className={cn(
                  'mt-1.5 text-xs tabular-nums',
                  kpis.listenersMomPct >= 0 ? 'text-green-500' : 'text-red-400',
                )}
              >
                {fmtPct(kpis.listenersMomPct)} {t('analytics_presence_mom')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border min-w-0">
          <CardHeader className="px-5 pb-2 pt-5">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <UserPlus size={14} aria-hidden="true" />
              {t('analytics_presence_kpi_followers')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-bold tabular-nums">
              {kpis.latestFollowers !== null ? fmtNum(kpis.latestFollowers) : '—'}
            </p>
            {kpis.followersMomPct !== null && (
              <p
                className={cn(
                  'mt-1.5 text-xs tabular-nums',
                  kpis.followersMomPct >= 0 ? 'text-green-500' : 'text-red-400',
                )}
              >
                {fmtPct(kpis.followersMomPct)} {t('analytics_presence_mom')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border min-w-0">
          <CardHeader className="px-5 pb-2 pt-5">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <PlayCircle size={14} aria-hidden="true" />
              {t('analytics_presence_kpi_track_plays')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-bold tabular-nums">
              {kpis.latestPublicTrackPlays !== null
                ? fmtNum(kpis.latestPublicTrackPlays)
                : '—'}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {kpis.trackCountLatest > 0
                ? t('analytics_presence_kpi_tracks_count', { count: kpis.trackCountLatest })
                : t('analytics_presence_kpi_tracks_none')}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border min-w-0">
          <CardHeader className="px-5 pb-2 pt-5">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <Disc size={14} aria-hidden="true" />
              {t('analytics_presence_kpi_releases')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-3xl font-bold tabular-nums">{kpis.releaseCountLatest || '—'}</p>
            {kpis.latestPeriod && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t('analytics_presence_period', { period: kpis.latestPeriod })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {model.insights.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">{t('analytics_presence_insights_heading')}</h3>
          <ul className="space-y-3">
            {model.insights.map((insight) => (
              <li
                key={insight.id}
                className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm"
              >
                <p className="font-semibold">{t(portalKey(insight.titleKey))}</p>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {t(portalKey(insight.bodyKey), insight.values)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SpotifyPresencePanelInner
        model={model}
        chartMode={chartMode}
        seriesVisibility={seriesVisibility}
      />

      {model.topTracks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">{t('analytics_presence_top_tracks_heading')}</h3>
          <div className={cn(horizontalScrollClass, 'rounded-lg border border-border')}>
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground" scope="col">
                    #
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground" scope="col">
                    {t('analytics_presence_col_track')}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground" scope="col">
                    {t('analytics_presence_col_release')}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right" scope="col">
                    {t('analytics_presence_col_plays')}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right" scope="col">
                    {t('analytics_presence_col_share')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.topTracks.map((row, idx) => (
                  <tr key={row.spotifyTrackId} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium">{row.trackName ?? row.spotifyTrackId}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.releaseTitle ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(row.playCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {model.byRelease.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">{t('analytics_presence_by_release_heading')}</h3>
          <div className={cn(horizontalScrollClass, 'rounded-lg border border-border')}>
            <table className="w-full text-sm min-w-[440px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground" scope="col">
                    {t('analytics_presence_col_release')}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right" scope="col">
                    {t('analytics_presence_col_tracks')}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right" scope="col">
                    {t('analytics_presence_col_plays')}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right" scope="col">
                    {t('analytics_presence_col_share')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.byRelease.map((row) => (
                  <tr
                    key={row.releaseId ?? 'none'}
                    className="border-b border-border/60 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 font-medium">
                      {row.releaseTitle ?? t('analytics_presence_unknown_release')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.trackCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNum(row.playCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
