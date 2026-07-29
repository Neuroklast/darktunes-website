import {
  ANALYTICS_TAB_IDS,
  DEFAULT_VISIBLE_TABS,
  PORTAL_ANALYTICS_VIEW_STORAGE_KEY,
  type AnalyticsTabId,
} from './constants'
import {
  PRESENCE_SERIES_KEYS,
  type PresenceChartMode,
  type PresenceSeriesKey,
} from './presenceChartUtils'
import type { PeriodPreset } from './filterMetrics'

export type TabVisibility = Record<AnalyticsTabId, boolean>

export type PresenceSeriesVisibility = Record<PresenceSeriesKey, boolean>

export interface AnalyticsChartPreferences {
  presenceMode: PresenceChartMode
  presenceSeries: PresenceSeriesVisibility
  periodPreset: PeriodPreset
}

export interface AnalyticsViewPreferences {
  tabs: TabVisibility
  charts: AnalyticsChartPreferences
}

export function getDefaultTabVisibility(): TabVisibility {
  return { ...DEFAULT_VISIBLE_TABS }
}

export function getDefaultPresenceSeriesVisibility(): PresenceSeriesVisibility {
  return {
    listeners: true,
    followers: true,
    albumTrackPlays: true,
    topTracksPlays: false,
    lastfm: true,
    soundcharts: true,
  }
}

export function getDefaultChartPreferences(): AnalyticsChartPreferences {
  return {
    presenceMode: 'absolute',
    presenceSeries: getDefaultPresenceSeriesVisibility(),
    periodPreset: 'all',
  }
}

export function getDefaultViewPreferences(): AnalyticsViewPreferences {
  return {
    tabs: getDefaultTabVisibility(),
    charts: getDefaultChartPreferences(),
  }
}

function parseTabVisibility(parsed: Partial<TabVisibility> | undefined): TabVisibility {
  const merged = getDefaultTabVisibility()
  if (!parsed) return merged
  for (const id of ANALYTICS_TAB_IDS) {
    if (typeof parsed[id] === 'boolean') merged[id] = parsed[id]!
  }
  return merged
}

function parseChartPreferences(raw: unknown): AnalyticsChartPreferences {
  const defaults = getDefaultChartPreferences()
  if (!raw || typeof raw !== 'object') return defaults
  const obj = raw as Partial<AnalyticsChartPreferences> & {
    presenceSeries?: Partial<PresenceSeriesVisibility>
  }
  if (obj.presenceMode === 'absolute' || obj.presenceMode === 'index') {
    defaults.presenceMode = obj.presenceMode
  }
  if (
    obj.periodPreset === 'all' ||
    obj.periodPreset === '3m' ||
    obj.periodPreset === '6m' ||
    obj.periodPreset === '12m' ||
    obj.periodPreset === 'custom'
  ) {
    defaults.periodPreset = obj.periodPreset
  }
  if (obj.presenceSeries && typeof obj.presenceSeries === 'object') {
    for (const key of PRESENCE_SERIES_KEYS) {
      if (typeof obj.presenceSeries[key] === 'boolean') {
        defaults.presenceSeries[key] = obj.presenceSeries[key]!
      }
    }
  }
  return defaults
}

/** Load full prefs; supports legacy shape `{ streaming: true, ... }` (tabs only). */
export function loadViewPreferences(storageKey: string): AnalyticsViewPreferences {
  if (typeof window === 'undefined') return getDefaultViewPreferences()
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return getDefaultViewPreferences()
    const parsed = JSON.parse(raw) as
      | Partial<AnalyticsViewPreferences>
      | Partial<TabVisibility>

    // Legacy: flat tab map without `tabs` key
    if (parsed && typeof parsed === 'object' && !('tabs' in parsed) && !('charts' in parsed)) {
      const maybeTabs = parsed as Partial<TabVisibility>
      if (ANALYTICS_TAB_IDS.some((id) => id in maybeTabs)) {
        return {
          tabs: parseTabVisibility(maybeTabs),
          charts: getDefaultChartPreferences(),
        }
      }
    }

    const modern = parsed as Partial<AnalyticsViewPreferences>
    return {
      tabs: parseTabVisibility(modern.tabs),
      charts: parseChartPreferences(modern.charts),
    }
  } catch {
    return getDefaultViewPreferences()
  }
}

export function saveViewPreferences(
  storageKey: string,
  prefs: AnalyticsViewPreferences,
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey, JSON.stringify(prefs))
}

/** @deprecated Use loadViewPreferences — kept for call-site migration */
export function loadTabVisibility(storageKey: string): TabVisibility {
  return loadViewPreferences(storageKey).tabs
}

/** @deprecated Use saveViewPreferences */
export function saveTabVisibility(storageKey: string, visibility: TabVisibility): void {
  const current = loadViewPreferences(storageKey)
  saveViewPreferences(storageKey, { ...current, tabs: visibility })
}

export function visibleTabIds(visibility: TabVisibility): AnalyticsTabId[] {
  return ANALYTICS_TAB_IDS.filter((id) => visibility[id])
}

export { PORTAL_ANALYTICS_VIEW_STORAGE_KEY }
