'use client'

import { useTranslations } from 'next-intl'
/**
 * app/portal/analytics/_components/StreamingChart.tsx — Client Component (leaf)
 *
 * Visualises streaming stats using Recharts BarChart.
 * Receives all data as props (IoC) — never fetches data directly.
 *
 * Recharts (~90 KB gzipped) is loaded lazily via next/dynamic so it is
 * excluded from the initial bundle. The portal is client-only so ssr: false
 * is safe.
 */

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { StreamingStat, PlatformAggregate } from '@/lib/api/streamingStats'
import type { Concert } from '@/types'
import { Skeleton } from '@/components/ui/skeleton'

export interface StreamingChartInnerProps {
  platforms: string[]
  monthlyData: Record<string, string | number>[]
  aggregates: PlatformAggregate[]
  eventMarkers: Array<{ period: string; label: string }>
}

interface StreamingChartProps {
  stats: StreamingStat[]
  aggregates: PlatformAggregate[]
  concerts: Concert[]
}

const StreamingChartInner = dynamic(
  () =>
    import('./StreamingChartInner').then((m) => m.StreamingChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    ),
  },
)

export function StreamingChart({ stats, aggregates, concerts }: StreamingChartProps) {
  const t = useTranslations('portal')

  // useMemo must be called before any early returns (Rules of Hooks).
  const { platforms, monthlyData, eventMarkers } = useMemo(() => {
    const _periods = [...new Set(stats.map((s) => s.period))].sort()
    const _platforms = [...new Set(stats.map((s) => s.platform))]
    // Pre-index stats by "period|platform" for O(1) lookup
    const statsIndex = new Map<string, number>()
    for (const s of stats) {
      statsIndex.set(`${s.period}|${s.platform}`, s.streams)
    }
    const _monthlyData = _periods.map((period) => {
      const row: Record<string, string | number> = { period }
      for (const platform of _platforms) {
        row[platform] = statsIndex.get(`${period}|${platform}`) ?? 0
      }
      return row
    })
    const _eventMarkers = concerts.map((c) => ({
      period: c.concertDate.slice(0, 7),
      label: `${c.eventName} (${c.venueCity ?? c.venueCountry ?? ''})`,
    }))

    return { platforms: _platforms, monthlyData: _monthlyData, eventMarkers: _eventMarkers }
  }, [stats, concerts])

  if (stats.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t('analytics_heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('analytics_streaming_hint')}</p>
        <p className="text-muted-foreground">{t('analytics_noData')}</p>
      </div>
    )
  }

  return (
    <StreamingChartInner
      platforms={platforms}
      monthlyData={monthlyData}
      aggregates={aggregates}
      eventMarkers={eventMarkers}
    />
  )
}
