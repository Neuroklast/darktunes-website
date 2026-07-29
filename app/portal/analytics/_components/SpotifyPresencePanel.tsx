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
import {
  horizontalScrollClass,
} from '@/components/ui/scroll-panel'
import { cn } from '@/lib/utils'
import { portalKey } from '@/i18n/portalKey'

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
        <p className="text-muted-foreground">{t('analytics_presence_noData')}</p>
      </div>
    )
  }

  const { kpis } = model

return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold">{t('analytics_presence_heading')}</h2>
          <p className="text-sm text-muted-foreground">{t('analytics_presence_hint')}</p>
        </div>
        <Badge variant="outline" className="text-xs font-normal shrink-0">
          {t('analytics_presence_source_badge')}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-card border-border min-w-0">
          <CardHeader className="pb-1 px-4 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('analytics_presence_kpi_listeners')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl sm:text-2xl font-bold tabular-nums">
              {kpis.latestListeners !== null ? fmtNum(kpis.latestListeners) : '—'}
            </p>
            {kpis.listenersMomPct !== null && (
              <p
                className={cn(
                  'text-xs mt-1.5 tabular-nums',
                  kpis.listenersMomPct >= 0 ? 'text-green-500' : 'text-red-400',
                )}
              >
                {fmtPct(kpis.listenersMomPct)} {t('analytics_presence_mom')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border min-w-0">
          <CardHeader className="pb-1 px-4 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('analytics_presence_kpi_followers')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl sm:text-2xl font-bold tabular-nums">
              {kpis.latestFollowers !== null ? fmtNum(kpis.latestFollowers) : '—'}
            </p>
            {kpis.followersMomPct !== null && (
              <p
                className={cn(
                  'text-xs mt-1.5 tabular-nums',
                  kpis.followersMomPct >= 0 ? 'text-green-500' : 'text-red-400',
                )}
              >
                {fmtPct(kpis.followersMomPct)} {t('analytics_presence_mom')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border min-w-0">
          <CardHeader className="pb-1 px-4 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('analytics_presence_kpi_track_plays')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl sm:text-2xl font-bold tabular-nums">
              {kpis.latestPublicTrackPlays !== null
                ? fmtNum(kpis.latestPublicTrackPlays)
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {kpis.trackCountLatest > 0
                ? t('analytics_presence_kpi_tracks_count', { count: kpis.trackCountLatest })
                : t('analytics_presence_kpi_tracks_none')}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border min-w-0">
          <CardHeader className="pb-1 px-4 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('analytics_presence_kpi_releases')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl sm:text-2xl font-bold tabular-nums">{kpis.releaseCountLatest || '—'}</p>
            {kpis.latestPeriod && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {t('analytics_presence_period', { period: kpis.latestPeriod })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {model.insights.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('analytics_presence_insights_heading')}</h3>
          <ul className="space-y-2">
            {model.insights.map((insight) => (
              <li
                key={insight.id}
                className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-sm"
              >
                <p className="font-medium">{t(portalKey(insight.titleKey))}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
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
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('analytics_presence_top_tracks_heading')}</h3>
          <div className={cn(horizontalScrollClass, 'rounded-md border border-border')}>
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-3 py-2.5 font-medium" scope="col">
                    #
                  </th>
                  <th className="px-3 py-2.5 font-medium" scope="col">
                    {t('analytics_presence_col_track')}
                  </th>
                  <th className="px-3 py-2.5 font-medium" scope="col">
                    {t('analytics_presence_col_release')}
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right" scope="col">
                    {t('analytics_presence_col_plays')}
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right" scope="col">
                    {t('analytics_presence_col_share')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.topTracks.map((row, idx) => (
                  <tr key={row.spotifyTrackId} className="border-b border-border/60">
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-medium">{row.trackName ?? row.spotifyTrackId}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.releaseTitle ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.playCount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {model.byRelease.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('analytics_presence_by_release_heading')}</h3>
          <div className={cn(horizontalScrollClass, 'rounded-md border border-border')}>
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-3 py-2.5 font-medium" scope="col">
                    {t('analytics_presence_col_release')}
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right" scope="col">
                    {t('analytics_presence_col_tracks')}
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right" scope="col">
                    {t('analytics_presence_col_plays')}
                  </th>
                  <th className="px-3 py-2.5 font-medium text-right" scope="col">
                    {t('analytics_presence_col_share')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.byRelease.map((row) => (
                  <tr
                    key={row.releaseId ?? 'none'}
                    className="border-b border-border/60"
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {row.releaseTitle ?? t('analytics_presence_unknown_release')}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.trackCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.playCount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.sharePct}%</td>
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
