'use client'

import { useTranslations } from 'next-intl'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { Card } from '@/components/ui/card'
import type { SpotifyPresencePanelInnerProps } from './SpotifyPresencePanel'

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  fontSize: 12,
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function SpotifyPresencePanelInner({ model }: SpotifyPresencePanelInnerProps) {
  const t = useTranslations('portal')
  const { trend, topTracks, secondaryListeners } = model

  const hasListeners = trend.some((d) => d.listeners > 0)
  const hasFollowers = trend.some((d) => d.followers > 0)
  const hasAlbumPlays = trend.some((d) => d.albumTrackPlays > 0)

  // Merge secondary sources into chart rows when present
  const lastfmMap = new Map(secondaryListeners.lastfm.map((p) => [p.period, p.value]))
  const scMap = new Map(secondaryListeners.soundcharts.map((p) => [p.period, p.value]))
  const hasLastfm = secondaryListeners.lastfm.some((p) => p.value > 0)
  const hasSoundcharts = secondaryListeners.soundcharts.some((p) => p.value > 0)

  const chartData = trend.map((row) => ({
    ...row,
    lastfm: lastfmMap.get(row.period) ?? 0,
    soundcharts: scMap.get(row.period) ?? 0,
  }))

  // Ensure secondary-only periods appear
  for (const p of secondaryListeners.lastfm) {
    if (!chartData.some((r) => r.period === p.period)) {
      chartData.push({
        period: p.period,
        listeners: 0,
        followers: 0,
        topTracksPlays: 0,
        albumTrackPlays: 0,
        lastfm: p.value,
        soundcharts: scMap.get(p.period) ?? 0,
      })
    }
  }
  chartData.sort((a, b) => a.period.localeCompare(b.period))

  const topBarData = topTracks.slice(0, 10).map((row) => ({
    name: (row.trackName ?? row.spotifyTrackId).slice(0, 24),
    plays: row.playCount,
  }))

  return (
    <div className="space-y-6">
      {(hasListeners || hasFollowers || hasLastfm || hasSoundcharts) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('analytics_presence_trend_heading')}</h3>
          <Card className="bg-card border-border p-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [fmtNum(Number(v ?? 0)), name ?? '']}
                />
                <Legend />
                {hasListeners && (
                  <Line
                    type="monotone"
                    dataKey="listeners"
                    name={t('analytics_presence_series_listeners')}
                    stroke="oklch(0.72 0.19 145)"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {hasFollowers && (
                  <Line
                    type="monotone"
                    dataKey="followers"
                    name={t('analytics_presence_series_followers')}
                    stroke="oklch(0.65 0.18 250)"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {hasAlbumPlays && (
                  <Line
                    type="monotone"
                    dataKey="albumTrackPlays"
                    name={t('analytics_presence_series_track_plays')}
                    stroke="oklch(0.70 0.15 40)"
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {hasLastfm && (
                  <Line
                    type="monotone"
                    dataKey="lastfm"
                    name={t('analytics_listeners_lastfm')}
                    stroke="oklch(0.65 0.28 295)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}
                {hasSoundcharts && (
                  <Line
                    type="monotone"
                    dataKey="soundcharts"
                    name={t('analytics_listeners_soundcharts')}
                    stroke="oklch(0.60 0.25 300)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {topBarData.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t('analytics_presence_top_tracks_chart_heading')}</h3>
          <Card className="bg-card border-border p-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={topBarData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtNum} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
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
