/**
 * Actionable insights for the portal overview dashboard.
 */

import type { AnalyticsInsight } from '@/lib/analytics/insights'
import type { StreamingStat } from '@/lib/api/streamingStats'
import type { SalesStatement } from '@/lib/api/salesStatements'
import type { PromoImpact } from '@/lib/api/promoImpact'
import type { ArtistSettlementSummary } from '@/lib/api/settlementLedger'
import { GROWTH_SIGNIFICANT_PCT } from './constants'

export interface OverviewInsight extends AnalyticsInsight {
  href?: string
}

function streamGrowthPct(stats: StreamingStat[]): number | null {
  const byPeriod = new Map<string, number>()
  for (const s of stats) {
    byPeriod.set(s.period, (byPeriod.get(s.period) ?? 0) + s.streams)
  }
  const periods = [...byPeriod.keys()].sort()
  if (periods.length < 2) return null
  const prev = byPeriod.get(periods[periods.length - 2]) ?? 0
  const last = byPeriod.get(periods[periods.length - 1]) ?? 0
  if (prev === 0) return last > 0 ? 100 : 0
  return Math.round(((last - prev) / prev) * 10000) / 100
}

function sosHref(tab: string, artistId?: string | null): string {
  const qs = new URLSearchParams({ tab })
  if (artistId) qs.set('artistId', artistId)
  return `/portal/sos-analytics?${qs.toString()}`
}

export function computeOverviewInsights(input: {
  stats: StreamingStat[]
  statements: SalesStatement[]
  settlement: ArtistSettlementSummary | null
  promoImpacts: PromoImpact[]
  analyticsEnabled: boolean
  artistId?: string | null
}): OverviewInsight[] {
  const insights: OverviewInsight[] = []
  const { stats, statements, settlement, promoImpacts, analyticsEnabled, artistId } = input

  if (!analyticsEnabled) return insights

  const growth = streamGrowthPct(stats)
  if (growth !== null && growth >= GROWTH_SIGNIFICANT_PCT) {
    insights.push({
      id: 'overview-growth',
      severity: 'positive',
      titleKey: 'overview_insight_growth_title',
      bodyKey: 'overview_insight_growth_body',
      values: { pct: growth },
      href: sosHref('streaming', artistId),
    })
  } else if (growth !== null && growth <= -GROWTH_SIGNIFICANT_PCT) {
    insights.push({
      id: 'overview-decline',
      severity: 'negative',
      titleKey: 'overview_insight_decline_title',
      bodyKey: 'overview_insight_decline_body',
      values: { pct: Math.abs(growth) },
      href: sosHref('streaming', artistId),
    })
  }

  const pendingStatements = statements.filter((s) => s.status === 'label_approved').length
  if (pendingStatements > 0) {
    insights.push({
      id: 'overview-pending-statements',
      severity: 'info',
      titleKey: 'overview_insight_pending_title',
      bodyKey: 'overview_insight_pending_body',
      values: { count: pendingStatements },
      href: '/portal/statements',
    })
  }

  if (settlement && Math.abs(settlement.balanceEur) >= 0.01) {
    insights.push({
      id: 'overview-settlement',
      severity: settlement.balanceEur > 0 ? 'positive' : 'info',
      titleKey: 'overview_insight_settlement_title',
      bodyKey: 'overview_insight_settlement_body',
      values: { balance: Math.round(settlement.balanceEur * 100) / 100 },
      href: sosHref('settlement', artistId),
    })
  }

  const topPromo = [...promoImpacts]
    .filter((p) => Math.abs(p.deltaPct) >= GROWTH_SIGNIFICANT_PCT)
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0]

  if (topPromo) {
    insights.push({
      id: 'overview-promo-impact',
      severity: topPromo.deltaPct >= 0 ? 'positive' : 'negative',
      titleKey: 'overview_insight_promo_title',
      bodyKey: 'overview_insight_promo_body',
      values: { pct: Math.abs(topPromo.deltaPct) },
      href: sosHref('events', artistId),
    })
  }

  return insights.slice(0, 5)
}