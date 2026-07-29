import type { StreamingStat } from '@/lib/api/streamingStats'
import type { ArtistTerritoryMetric } from '@/lib/api/artistTerritoryMetrics'
import type { ArtistListenerMetric } from '@/lib/api/artistListenerMetrics'
import type { EventImpact } from '@/lib/api/eventImpact'
import type { ArtistLineItemWithContext } from '@/lib/api/salesStatementLineItems'

export interface AnalyticsFilterState {
  periodFrom: string
  periodTo: string
  platform: string
  country: string
}

export const EMPTY_ANALYTICS_FILTER: AnalyticsFilterState = {
  periodFrom: '',
  periodTo: '',
  platform: '',
  country: '',
}

function inPeriodRange(period: string, from: string, to: string): boolean {
  if (from && period < from) return false
  if (to && period > to) return false
  return true
}

export function collectAvailablePeriods(
  stats: StreamingStat[],
  territoryMetrics: ArtistTerritoryMetric[],
  extraPeriods: string[] = [],
): string[] {
  const periods = new Set<string>()
  for (const s of stats) periods.add(s.period)
  for (const m of territoryMetrics) periods.add(m.period)
  for (const p of extraPeriods) if (p) periods.add(p)
  return Array.from(periods).sort()
}

export type PeriodPreset = 'all' | '3m' | '6m' | '12m' | 'custom'

/**
 * Resolve a rolling preset against sorted available periods (YYYY-MM).
 * Uses the last N distinct periods present in data (not calendar months).
 */
export function resolvePeriodPreset(
  periodsSortedAsc: string[],
  preset: PeriodPreset,
): Pick<AnalyticsFilterState, 'periodFrom' | 'periodTo'> {
  if (preset === 'all' || preset === 'custom' || periodsSortedAsc.length === 0) {
    return { periodFrom: '', periodTo: '' }
  }
  const n = preset === '3m' ? 3 : preset === '6m' ? 6 : 12
  const slice = periodsSortedAsc.slice(-n)
  return {
    periodFrom: slice[0] ?? '',
    periodTo: slice[slice.length - 1] ?? '',
  }
}

export function collectAvailablePlatforms(
  stats: StreamingStat[],
  territoryMetrics: ArtistTerritoryMetric[],
): string[] {
  const platforms = new Set<string>()
  for (const s of stats) platforms.add(s.platform)
  for (const m of territoryMetrics) if (m.platform) platforms.add(m.platform)
  return Array.from(platforms).sort()
}

export function collectAvailableCountries(
  territoryMetrics: ArtistTerritoryMetric[],
): string[] {
  const countries = new Set<string>()
  for (const m of territoryMetrics) if (m.country) countries.add(m.country)
  return Array.from(countries).sort()
}

export function filterStreamingStats(
  stats: StreamingStat[],
  filters: AnalyticsFilterState,
): StreamingStat[] {
  return stats.filter((s) => {
    if (!inPeriodRange(s.period, filters.periodFrom, filters.periodTo)) return false
    if (filters.platform && s.platform !== filters.platform) return false
    return true
  })
}

export function filterTerritoryMetrics(
  metrics: ArtistTerritoryMetric[],
  filters: AnalyticsFilterState,
): ArtistTerritoryMetric[] {
  return metrics.filter((m) => {
    if (!inPeriodRange(m.period, filters.periodFrom, filters.periodTo)) return false
    if (filters.platform && m.platform !== filters.platform) return false
    if (filters.country && m.country !== filters.country) return false
    return true
  })
}

export function filterListenerMetrics(
  metrics: ArtistListenerMetric[],
  filters: AnalyticsFilterState,
): ArtistListenerMetric[] {
  return metrics.filter((m) => inPeriodRange(m.period, filters.periodFrom, filters.periodTo))
}

export function filterEventImpacts(
  impacts: EventImpact[],
  filters: AnalyticsFilterState,
): EventImpact[] {
  if (!filters.country) return impacts
  return impacts.filter((impact) => impact.country === filters.country)
}

export function filterLineItemsByPeriod(
  items: ArtistLineItemWithContext[],
  filters: AnalyticsFilterState,
): ArtistLineItemWithContext[] {
  if (!filters.periodFrom && !filters.periodTo) return items
  return items.filter((item) => {
    const period = item.periodStart?.slice(0, 7) ?? item.periodEnd?.slice(0, 7) ?? ''
    if (!period) return true
    return inPeriodRange(period, filters.periodFrom, filters.periodTo)
  })
}