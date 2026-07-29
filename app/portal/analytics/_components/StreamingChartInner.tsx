'use client'

import { useTranslations } from 'next-intl'
/**
 * app/portal/analytics/_components/StreamingChartInner.tsx
 *
 * Contains all Recharts imports. Loaded lazily via dynamic() in StreamingChart.tsx
 * to avoid adding ~90 KB of Recharts to the initial bundle.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PLATFORM_COLORS, formatPlatformLabel } from './streamingChartUtils'
import type { StreamingChartInnerProps } from './StreamingChart'

export function StreamingChartInner({ platforms, monthlyData, aggregates, eventMarkers }: StreamingChartInnerProps) {
  const t = useTranslations('portal')

  const totalStreams = aggregates.reduce((sum, a) => sum + a.totalStreams, 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{t('analytics_heading')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('analytics_streaming_hint')}</p>
        </div>
        <Badge variant="outline" className="text-xs font-normal">
          {t('analytics_streaming_source_badge')}
        </Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border col-span-2 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">
              {t('analytics_totalStreams')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalStreams.toLocaleString()}</p>
          </CardContent>
        </Card>

        {aggregates.map((agg) => (
          <Card key={agg.platform} className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest">
                {formatPlatformLabel(agg.platform)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{agg.totalStreams.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly bar chart */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>{t('analytics_monthlyTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div role="img" aria-label={t('analytics_monthlyTrend')}>
          <ResponsiveContainer
            width="100%"
            height={300}
          >
            <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#383838" />
              <XAxis dataKey="period" stroke="#666" tick={{ fill: '#999', fontSize: 12 }} />
              <YAxis stroke="#666" tick={{ fill: '#999', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#292929', border: '1px solid #383838' }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: '#ccc', fontSize: 12 }}>
                    {formatPlatformLabel(value)}
                  </span>
                )}
              />
              {platforms.map((platform) => (
                <Bar
                  key={platform}
                  dataKey={platform}
                  fill={PLATFORM_COLORS[platform] ?? 'var(--primary)'}
                  radius={[2, 2, 0, 0]}
                />
              ))}
              {eventMarkers.map((marker) => (
                <ReferenceLine
                  key={`${marker.period}-${marker.label}`}
                  x={marker.period}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: '●', position: 'top', fill: '#f59e0b', fontSize: 10 }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          </div>

          {/* Visually-hidden data table for screen readers */}
          <table className="sr-only">
            <caption>{t('analytics_monthlyTrend')}</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                {platforms.map((p) => (
                  <th key={p} scope="col">{formatPlatformLabel(p)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((row) => (
                <tr key={String(row.period)}>
                  <td>{row.period}</td>
                  {platforms.map((p) => (
                    <td key={p}>{row[p]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
