'use client'

/**
 * src/components/admin/sos/TrendsDashboard.tsx
 *
 * Multi-period revenue trend view built from sos_period_summaries.
 * Displays revenue and payout over time using recharts AreaChart.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { TrendUp, CalendarBlank, FloppyDisk } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RevenueSummaryCard } from './RevenueSummaryCard'
import type { ArtistRevenue } from '@/lib/sos/types'
import { useMergedAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'
import { explainSosError } from '@/lib/sos/explainSosError'

interface PeriodSummary {
  id: string
  period_start: string
  period_end: string
  total_revenue: number
  total_payout: number
  artist_count: number
  source_batch_ids?: string[]
  created_at: string
}

interface TrendsDashboardProps {
  /** Current period revenues — used to save a new summary on demand. */
  revenues?: ArtistRevenue[]
  periodStart?: string
  periodEnd?: string
  bronzeBatchIds?: string[]
}

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function fmtShort(n: number) {
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`
  return fmtEur(n)
}

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  fontSize: 12,
}

const TRENDS_FALLBACK = {
    trendsSavePeriod: 'Save period {period}',
    trendsUpdatePeriod: 'Update period {period}',
    trendsLoadFailed: 'Failed to load period summaries',
    trendsRetry: 'Reload',
    trendsSaved: 'Period summary saved',
    trendsUpdated: 'Period summary updated',
    trendsHeading: 'Revenue Trends',
    trendsLatestRevenue: 'Latest Revenue',
    trendsLatestPayout: 'Latest Payout',
    trendsPeriodsTracked: 'Periods tracked',
    trendsLoading: 'Loading historical data…',
    trendsEmptyTitle: 'No historical data yet.',
    trendsEmptyHint:
      'Upload CSV files and click "Save period" (or use Save to Portal in Analytics) to start tracking trends.',
    trendsChartTitle: 'Revenue & Payout Over Time',
    trendsOnePeriodHint: '1 period saved. Save at least one more to see a trend chart.',
    trendsSaveFailed: 'Failed to save period summary',
} as const

export function TrendsDashboard({
  revenues = [],
  periodStart = '',
  periodEnd = '',
  bronzeBatchIds = [],
}: TrendsDashboardProps) {
  const t = useMergedAccountingLabels(TRENDS_FALLBACK)

  const [summaries, setSummaries] = useState<PeriodSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const loadSummaries = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/sos/period-summaries')
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error ?? t.trendsLoadFailed)
      }
      const data = await res.json() as { summaries: PeriodSummary[] }
      setSummaries((data.summaries ?? []).sort((a, b) => a.period_start.localeCompare(b.period_start)))
      setLoadError(null)
    } catch (err) {
      const message = explainSosError(err instanceof Error ? err.message : t.trendsLoadFailed, t)
      setLoadError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadSummaries()
  }, [loadSummaries])

  const handleSavePeriod = useCallback(async () => {
    if (!periodStart || revenues.length === 0) return
    setIsSaving(true)
    try {
      const total_revenue = revenues.reduce((s, r) => s + r.totalRevenue, 0)
      const total_payout = revenues.reduce((s, r) => s + r.finalAmount, 0)
      const res = await fetch('/api/admin/sos/period-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_start: periodStart,
          period_end: periodEnd || periodStart,
          total_revenue,
          total_payout,
          artist_count: revenues.length,
          artist_breakdowns: revenues.map(r => ({ artist: r.artist, revenue: r.totalRevenue, payout: r.finalAmount })),
          platform_breakdowns: revenues.flatMap(r => r.platformBreakdown),
          source_batch_ids: bronzeBatchIds,
        }),
      })
      const payload = await res.json().catch(() => ({})) as { error?: string; updated?: boolean }
      if (res.ok) {
        toast.success(payload.updated ? t.trendsUpdated : t.trendsSaved)
        await loadSummaries()
      } else {
        toast.error(t.trendsSaveFailed, { description: explainSosError(payload.error, t) })
      }
    } finally {
      setIsSaving(false)
    }
  }, [revenues, periodStart, periodEnd, bronzeBatchIds, loadSummaries, t])

  const chartData = useMemo(() => summaries.map(s => ({
    period: s.period_start,
    Revenue: Number(s.total_revenue),
    Payout: Number(s.total_payout),
  })), [summaries])

  const latestRevenue = summaries.at(-1)?.total_revenue ?? 0
  const latestPayout = summaries.at(-1)?.total_payout ?? 0

  const effectivePeriodEnd = periodEnd || periodStart
  const currentPeriodExists = useMemo(
    () =>
      summaries.some(
        (s) => s.period_start === periodStart && s.period_end === effectivePeriodEnd,
      ),
    [summaries, periodStart, effectivePeriodEnd],
  )

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendUp size={20} weight="bold" className="text-primary" />
          <h3 className="font-semibold">{t.trendsHeading}</h3>
        </div>

        {revenues.length > 0 && periodStart && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSavePeriod}
            disabled={isSaving}
            className="gap-1.5 text-xs"
          >
            <FloppyDisk size={13} />{' '}
            {currentPeriodExists
              ? interpolate(t.trendsUpdatePeriod, { period: periodStart })
              : interpolate(t.trendsSavePeriod, { period: periodStart })}
          </Button>
        )}
      </div>

      {summaries.length >= 2 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <RevenueSummaryCard label={t.trendsLatestRevenue} value={fmtEur(latestRevenue)} />
          <RevenueSummaryCard label={t.trendsLatestPayout} value={fmtEur(latestPayout)} />
          <RevenueSummaryCard label={t.trendsPeriodsTracked} value={String(summaries.length)} />
        </div>
      )}

      {isLoading && summaries.length === 0 && !loadError && (
        <p className="text-sm text-muted-foreground animate-pulse">{t.trendsLoading}</p>
      )}

      {loadError && (
        <div
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm text-destructive">{loadError}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadSummaries()} disabled={isLoading}>
            {t.trendsRetry}
          </Button>
        </div>
      )}

      {!isLoading && !loadError && chartData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <CalendarBlank size={32} className="opacity-30" />
          <p className="text-sm">{t.trendsEmptyTitle}</p>
          <p className="text-xs">{t.trendsEmptyHint}</p>
        </div>
      )}

      {chartData.length >= 2 && (
        <Card className="min-w-0 p-4">
          <p className="mb-4 text-sm font-semibold">{t.trendsChartTitle}</p>
          <div className="h-[300px] min-w-0 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={150}>
            <AreaChart data={chartData} margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.28 295)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.65 0.28 295)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.60 0.25 300)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="oklch(0.60 0.25 300)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtShort} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [fmtEur(Number(v ?? 0)), name ?? '']}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="Revenue"
                stroke="oklch(0.65 0.28 295)"
                fill="url(#revGrad2)"
                strokeWidth={2}
                 isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="Payout"
                stroke="oklch(0.60 0.25 300)"
                fill="url(#payGrad)"
                strokeWidth={2}
                 isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </Card>
      )}

      {chartData.length === 1 && (
        <Card className="p-4 text-sm text-muted-foreground text-center">
          {t.trendsOnePeriodHint}
        </Card>
      )}
    </div>
  )
}
