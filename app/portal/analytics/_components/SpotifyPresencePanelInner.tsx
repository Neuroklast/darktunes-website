'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts'
import { Card } from '@/components/ui/card'
import type { SpotifyPresencePanelInnerProps } from './SpotifyPresencePanel'
import {
  AUDIENCE_SERIES,
  PLAYS_SERIES,
  PRESENCE_DONUT_PALETTE,
  PRESENCE_SERIES_COLORS,
  seriesHasData,
  toIndexChartData,
  type PresenceChartMode,
  type PresenceChartRow,
  type PresenceSeriesKey,
} from '@/lib/analytics/presenceChartUtils'
import type { PresenceSeriesVisibility } from '@/lib/analytics/viewPreferences'

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 14px',
  boxShadow: '0 6px 16px rgb(0 0 0 / 0.35)',
}

const TOOLTIP_LABEL_STYLE = {
  color: 'var(--foreground)',
  fontWeight: 600,
  marginBottom: 6,
}

const TOOLTIP_ITEM_STYLE = {
  padding: '2px 0',
}

/** Audience series that get a soft gradient area underlay in absolute mode. */
const AREA_SERIES: PresenceSeriesKey[] = ['listeners', 'followers']

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export interface SpotifyPresenceChartsProps extends SpotifyPresencePanelInnerProps {
  chartMode?: PresenceChartMode
  seriesVisibility?: PresenceSeriesVisibility
}

function SeriesLegend({ series, labelFor }: { series: PresenceSeriesKey[]; labelFor: (k: PresenceSeriesKey) => string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-3">
      {series.map((key) => (
        <span key={key} className="flex items-center gap-1.5 text-xs">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: PRESENCE_SERIES_COLORS[key] }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{labelFor(key)}</span>
        </span>
      ))}
    </div>
  )
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
    return trend
      .map((row) => ({
        period: row.period,
        listeners: row.listeners,
        followers: row.followers,
        albumTrackPlays: row.albumTrackPlays,
        topTracksPlays: row.topTracksPlays,
        lastfm: lastfmMap.get(row.period) ?? 0,
        soundcharts: scMap.get(row.period) ?? 0,
      }))
      .sort((a, b) => a.period.localeCompare(b.period))
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
    name: (row.trackName ?? row.spotifyTrackId).slice(0, 24),
    value: row.playCount,
    pct: row.sharePct,
  }))

  const releasePieData = byRelease.slice(0, 8).map((row) => ({
    name: (row.releaseTitle ?? t('analytics_presence_unknown_release')).slice(0, 24),
    value: row.playCount,
    pct: row.sharePct,
  }))

  const hasTrend = activeSeries.length > 0 && chartData.length > 0

  const renderTrendSeries = () =>
    activeSeries.map((key) => {
      const color = PRESENCE_SERIES_COLORS[key]
      const dashed = key === 'lastfm' || key === 'soundcharts'
      const isArea = AREA_SERIES.includes(key) && chartMode === 'absolute'
      if (isArea) {
        return (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={seriesLabel(key)}
            yAxisId={yAxisIdFor(key)}
            stroke={color}
            fill={`url(#presence-grad-${key})`}
            strokeWidth={2}
            fillOpacity={1}
            dot={false}
            connectNulls
          />
        )
      }
      return (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          name={seriesLabel(key)}
          yAxisId={yAxisIdFor(key)}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? '4 4' : undefined}
          dot={false}
          connectNulls
        />
      )
    })

  const donutCenter = (top?: { name: string; pct: number }) =>
    top ? (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <span className="text-2xl font-bold tabular-nums">{top.pct}%</span>
        <span className="mt-0.5 w-full truncate text-xs text-muted-foreground">{top.name}</span>
      </div>
    ) : null

  const donutLegend = (data: { name: string; value: number; pct: number }[]) =>
    data.length > 0 ? (
      <ul className="mt-4 space-y-2 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: PRESENCE_DONUT_PALETTE[i % PRESENCE_DONUT_PALETTE.length] }}
                aria-hidden="true"
              />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {fmtNum(d.value)} · {d.pct}%
            </span>
          </li>
        ))}
      </ul>
    ) : null

  return (
    <div className="space-y-8">
      {hasTrend && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold">{t('analytics_presence_trend_heading')}</h3>
            <p className="text-xs text-muted-foreground">
              {chartMode === 'index'
                ? t('analytics_presence_chart_mode_index_hint')
                : dualAxis
                  ? t('analytics_presence_chart_mode_dual_hint')
                  : t('analytics_presence_chart_mode_single_hint')}
            </p>
          </div>
          <Card className="bg-card border-border p-4 sm:p-6">
            <div role="img" aria-label={t('analytics_presence_trend_heading')}>
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                  <defs>
                    {AREA_SERIES.filter((k) => activeSeries.includes(k)).map((k) => (
                      <linearGradient key={k} id={`presence-grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PRESENCE_SERIES_COLORS[k]} stopOpacity={0.32} />
                        <stop offset="95%" stopColor={PRESENCE_SERIES_COLORS[k]} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} stroke="var(--border)" tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  {chartMode === 'index' || !dualAxis ? (
                    <YAxis
                      yAxisId="single"
                      tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                      tickFormatter={chartMode === 'index' ? (v) => `${v}` : fmtNum}
                      width={52}
                      tickLine={false}
                      axisLine={false}
                    />
                  ) : (
                    <>
                      <YAxis
                        yAxisId="audience"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        tickFormatter={fmtNum}
                        width={52}
                        tickLine={false}
                        axisLine={false}
                        label={{
                          value: t('analytics_presence_axis_audience'),
                          angle: -90,
                          position: 'insideLeft',
                          style: { fontSize: 10, fill: 'var(--muted-foreground)' },
                        }}
                      />
                      <YAxis
                        yAxisId="plays"
                        orientation="right"
                        tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                        tickFormatter={fmtNum}
                        width={56}
                        tickLine={false}
                        axisLine={false}
                        label={{
                          value: t('analytics_presence_axis_plays'),
                          angle: 90,
                          position: 'insideRight',
                          style: { fontSize: 10, fill: 'var(--muted-foreground)' },
                        }}
                      />
                    </>
                  )}
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={(v, name) => {
                      const num = Number(v ?? 0)
                      if (chartMode === 'index') return [`${num}`, name ?? '']
                      return [fmtNum(num), name ?? '']
                    }}
                  />
                  {renderTrendSeries()}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <SeriesLegend series={activeSeries} labelFor={seriesLabel} />
          </Card>
        </div>
      )}

      {(topPieData.length > 0 || releasePieData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {topPieData.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold">{t('analytics_presence_share_tracks_heading')}</h3>
              <Card className="bg-card border-border p-4 sm:p-6">
                <div className="relative h-64" role="img" aria-label={t('analytics_presence_share_tracks_heading')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={topPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {topPieData.map((_, i) => (
                          <Cell key={i} fill={PRESENCE_DONUT_PALETTE[i % PRESENCE_DONUT_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        formatter={(v, name) => [`${fmtNum(Number(v ?? 0))}`, name ?? '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {donutCenter(topPieData[0])}
                </div>
                {donutLegend(topPieData)}
              </Card>
            </div>
          )}
          {releasePieData.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold">{t('analytics_presence_share_releases_heading')}</h3>
              <Card className="bg-card border-border p-4 sm:p-6">
                <div className="relative h-64" role="img" aria-label={t('analytics_presence_share_releases_heading')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={releasePieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {releasePieData.map((_, i) => (
                          <Cell key={i} fill={PRESENCE_DONUT_PALETTE[(i + 3) % PRESENCE_DONUT_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        formatter={(v, name) => [`${fmtNum(Number(v ?? 0))}`, name ?? '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {donutCenter(releasePieData[0])}
                </div>
                {donutLegend(releasePieData)}
              </Card>
            </div>
          )}
        </div>
      )}

      {topBarData.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">{t('analytics_presence_top_tracks_chart_heading')}</h3>
          <Card className="bg-card border-border p-4 sm:p-6">
            <div role="img" aria-label={t('analytics_presence_top_tracks_chart_heading')}>
              <ResponsiveContainer width="100%" height={Math.max(260, topBarData.length * 34)}>
                <BarChart data={topBarData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="presence-track-bar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={PRESENCE_SERIES_COLORS.albumTrackPlays} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PRESENCE_SERIES_COLORS.albumTrackPlays} stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={fmtNum} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    formatter={(v) => [fmtNum(Number(v ?? 0)), t('analytics_presence_col_plays')]}
                  />
                  <Bar dataKey="plays" fill="url(#presence-track-bar)" radius={[0, 6, 6, 0]} name={t('analytics_presence_col_plays')}>
                    <LabelList
                      dataKey="plays"
                      position="right"
                      formatter={(value) => fmtNum(Number(value))}
                      style={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>{t('analytics_presence_top_tracks_chart_heading')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('analytics_presence_col_track')}</th>
                  <th scope="col">{t('analytics_presence_col_plays')}</th>
                </tr>
              </thead>
              <tbody>
                {topBarData.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.plays.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  )
}
