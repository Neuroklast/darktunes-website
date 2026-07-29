'use client'

import { useTranslations } from 'next-intl'
import { ChartLineUp, Globe, MusicNote, CurrencyEur, TrendUp, Receipt } from '@phosphor-icons/react'
import { Card, CardContent } from '@/components/ui/card'
import type { AnalyticsKpis } from '@/lib/analytics/insights'

interface AnalyticsKpiGridProps {
  kpis: AnalyticsKpis
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n)
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export function AnalyticsKpiGrid({ kpis }: AnalyticsKpiGridProps) {
  const t = useTranslations('portal')

  const cards = [
    {
      label: t('analytics_totalStreams'),
      value: fmtNum(kpis.totalStreams),
      sub: kpis.streamGrowthPct !== null ? fmtPct(kpis.streamGrowthPct) : undefined,
      icon: MusicNote,
    },
    {
      label: t('analytics_kpi_revenue'),
      value: fmtEur(kpis.totalRevenueEur),
      sub: kpis.revenueGrowthPct !== null ? fmtPct(kpis.revenueGrowthPct) : undefined,
      icon: CurrencyEur,
    },
    {
      label: t('analytics_kpi_top_platform'),
      value: kpis.topPlatform ?? '—',
      icon: ChartLineUp,
    },
    {
      label: t('analytics_kpi_top_country'),
      value: kpis.topCountry ?? '—',
      icon: Globe,
    },
    {
      label: t('analytics_kpi_periods'),
      value: String(kpis.periodCount),
      icon: TrendUp,
    },
    {
      label: t('analytics_earnings_pending'),
      value: String(kpis.pendingStatements),
      sub: kpis.totalEarningsEur > 0 ? fmtEur(kpis.totalEarningsEur) : undefined,
      icon: Receipt,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="border-border bg-card/80 min-w-0">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <card.icon size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{card.label}</span>
            </div>
            <p className="text-base sm:text-lg font-semibold tabular-nums truncate">{card.value}</p>
            {card.sub && (
              <p className="text-xs text-muted-foreground tabular-nums">{card.sub}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}