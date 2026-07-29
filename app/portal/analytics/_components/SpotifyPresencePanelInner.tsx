'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card } from '@/components/ui/card'
import type { SpotifyPresencePanelInnerProps } from './SpotifyPresencePanel'
import {
  AUDIENCE_SERIES,
  PLAYS_SERIES,
  seriesHasData,
  toIndexChartData,
  type PresenceChartMode,
  type PresenceChartRow,
  type PresenceSeriesKey,
} from '@/lib/analytics/presenceChartUtils'
import type { PresenceSeriesVisibility } from '@/lib/analytics/viewPreferences'

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  fontSize: 12,
}

const SERIES_COLORS: Record<PresenceSeriesKey, string> = {
  listeners: 'oklch(0.72 0.19 145)',
  followers: 'oklch(0.65 0.18 250)',
  albumTrackPlays: 'oklch(0.70 0.15 40)',
  topTracksPlays: 'oklch(0.75 0.12 80)',
  lastfm: 'oklch(0.65 0.28 295)',
  soundcharts: 'oklch(0.60 0.25 300)',
}

const PIE_COLORS = [
  'oklch(0.72 0.19 145)',
  'oklch(0.65 0.18 250)',
  'oklch(0.70 0.15 40)',
  'oklch(0.65 0.28 295)',
  'oklch(0.60 0.22 20)',
  'oklch(0.68 0.14 200)',
  'oklch(0.55 0.16 320)',
  'oklch(0.75 0.10 100)',
]

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export interface SpotifyPresenceChartsProps extends SpotifyPresencePanelInnerProps {
  chartMode?: PresenceChartMode
  seriesVisibility?: PresenceSeriesVisibility
}

export function SpotifyPresencePanelInner({
  model,
  chartMode = 'absolute',
  seriesVisibility,
}: SpotifyPresenceChartsProps) {
  const t = useTranslations('portal')
  const { trend, topTracks, secondaryListeners, byRelease } = model

  const seriesOn: PresenceSeriesVisibility = seriesVisibility ?? {
    listeners: true,
    followers: true,
    albumTrackPlays: true,
    topTracksPlays: false,
    lastfm: true,
    soundcharts: true,
  }

  const chartDataRaw: PresenceChartRow[] = useMemo(() => {
    const lastfmMap = new Map(secondaryListeners.lastfm.map((p) => [p.period, p.value]))
    const scMap = new Map(secondaryListeners.soundcharts.map((p) => [p.period, p.value]))
    const rows: PresenceChartRow[] = trend.map((row) => ({
      period: row.period,
      listeners: row.listeners,
      followers: row.followers,
      albumTrackPlays: row.albumTrackPlays,
      topTracksPlays: row.topTracksPlays,
      lastfm: lastfmMap.get(row.period) ?? 0,
      soundcharts: scMap.get(row.period) ?? 0,
    }))
    for (const p of secondaryListeners.lastfm) {
      if (!rows.some((r) => r.period === p.period)) {
        rows.push({
          period: p.period,
          listeners: 0,
          followers: 0,
          albumTrackPlays: 0,
          topTracksPlays: 0,
          lastfm: p.value,
          soundcharts: scMap.get(p.period) ?? 0,
        })
      }
    }
    rows.sort((a, b) => a.period.localeCompare(b.period))
    return rows
  }, [trend, secondaryListeners])

  const activeSeries = (Object.keys(seriesOn) as PresenceSeriesKey[]).filter(
    (k) => seriesOn[k] && seriesHasData(chartDataRaw, k),
  )

  const chartData =
    chartMode === 'index'
      ? toIndexChartData(chartDataRaw, activeSeries)
      : chartDataRaw

  const showAudienceAxis =
    chartMode === 'absolute' && activeSeries.some((k) => AUDIENCE_SERIES.includes(k))
  const showPlaysAxis =
    chartMode === 'absolute' && activeSeries.some((k) => PLAYS_SERIES.includes(k))
  const dualAxis = showAudienceAxis && showPlaysAxis

  const seriesLabel = (key: PresenceSeriesKey): string => {
    switch (key) {
      case 'listeners':
        return t('analytics_presence_series_listeners')
      case 'followers':
        return t('analytics_presence_series_followers')
      case 'albumTrackPlays':
        return t('analytics_presence_series_track_plays')
      case 'topTracksPlays':
        return t('analytics_presence_series_top_plays')
      case 'lastfm':
        return t('analytics_listeners_lastfm')
      case 'soundcharts':
        return t('analytics_listeners_soundcharts')
      default:
        return key
    }
  }

  const yAxisIdFor = (key: PresenceSeriesKey): 'audience' | 'plays' | 'single' => {
    if (chartMode === 'index' || !dualAxis) return 'single'
    return PLAYS_SERIES.includes(key) ? 'plays' : 'audience'
  }

  const topBarData = topTracks.slice(0, 10).map((row) => ({
    name: (row.trackName ?? row.spotifyTrackId).slice(0, 24),
    plays: row.playCount,
  }))

  const topPieData = topTracks.slice(0, 8).map((row) => ({
    name: (row.trackName ?? row.spotifyTrackId).slice(0, 20),
    value: row.playCount,
    pct: row.sharePct,
  }))

  const releasePieData = byRelease.slice(0, 8).map((row) => ({
    name: (row.releaseTitle ?? t('analytics_presence_unknown_release')).slice(0, 20),
    value: row.playCount,
    pct: row.sharePct,
  }))

  const hasTrend = activeSeries.length > 0 && chartData.length > 0

  return (
    <div className="space-y-6">
      {hasTrend && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('analytics_presence_trend_heading')}</h3>
            <p className="text-xs text-muted-foreground">
              {chartMode === 'index'
                ? t('analytics_presence_chart_mode_index_hint')
                : dualAxis
                  ? t('analytics_presence_chart_mode_dual_hint')
                  : t('analytics_presence_chart_mode_single_hint')}
            </p>
          </div>
          <Card className="bg-card border-border p-4 sm:p-5">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                {chartMode === 'index' || !dualAxis ? (
                  <YAxis
                    yAxisId="single"
                    tick={{ fontSize: 11 }}
                    tickFormatter={chartMode === 'index' ? (v) => `${v}` : fmtNum}
                    width={48}
                  />
                ) : (
                  <>
                    <YAxis
                      yAxisId="audience"
                      tick={{ fontSize: 11 }}
                      tickFormatter={fmtNum}
                      width={48}
                      label={{
                        value: t('analytics_presence_axis_audience'),
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
                      }}
                    />
                    <YAxis
                      yAxisId="plays"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      tickFormatter={fmtNum}
                      width={52}
                      label={{
                        value: t('analytics_presence_axis_plays'),
                        angle: 90,
                        position: 'insideRight',
                        style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
                      }}
                    />
                  </>
                )}
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => {
                    const num = Number(v ?? 0)
                    if (chartMode === 'index') {
                      return [`${num}`, name ?? '']
                    }
                    return [fmtNum(num), name ?? '']
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
                {activeSeries.map((key) => {
                  const dashed = key === 'lastfm' || key === 'soundcharts'
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={seriesLabel(key)}
                      yAxisId={yAxisIdFor(key)}
                      stroke={SERIES_COLORS[key]}
                      strokeWidth={2}
                      strokeDasharray={dashed ? '4 4' : undefined}
                      dot={false}
                      connectNulls
                    />
                  )
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {(topPieData.length > 0 || releasePieData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {topPieData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('analytics_presence_share_tracks_heading')}</h3>
              <Card className="bg-card border-border p-4 sm:p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={topPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {topPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v, name, item) => {
                        const pct = (item?.payload as { pct?: number } | undefined)?.pct
                        return [
                          `${fmtNum(Number(v ?? 0))}${pct != null ? ` (${pct}%)` : ''}`,
                          name ?? '',
                        ]
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}
          {releasePieData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('analytics_presence_share_releases_heading')}</h3>
              <Card className="bg-card border-border p-4 sm:p-5">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={releasePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {releasePieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v, name, item) => {
                        const pct = (item?.payload as { pct?: number } | undefined)?.pct
                        return [
                          `${fmtNum(Number(v ?? 0))}${pct != null ? ` (${pct}%)` : ''}`,
                          name ?? '',
                        ]
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}
        </div>
      )}

      {topBarData.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('analytics_presence_top_tracks_chart_heading')}</h3>
          <Card className="bg-card border-border p-4 sm:p-5">
            <ResponsiveContainer width="100%" height={Math.max(220, topBarData.length * 28)}>
              <BarChart
                data={topBarData}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v) => [fmtNum(Number(v ?? 0)), t('analytics_presence_col_plays')]}
                />
                <Bar
                  dataKey="plays"
                  fill="oklch(0.72 0.19 145)"
                  radius={[0, 4, 4, 0]}
                  name={t('analytics_presence_col_plays')}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  )
}
