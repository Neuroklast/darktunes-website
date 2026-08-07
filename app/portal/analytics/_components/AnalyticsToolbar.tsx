'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  DownloadSimple,
  FilePdf,
  MagnifyingGlass,
  Question,
  SlidersHorizontal,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ANALYTICS_TAB_IDS,
  SOS_ANALYTICS_TAB_IDS,
  type AnalyticsTabId,
} from '@/lib/analytics/constants'
import {
  loadViewPreferences,
  saveViewPreferences,
  PORTAL_ANALYTICS_VIEW_STORAGE_KEY,
  type AnalyticsViewPreferences,
  type PresenceSeriesVisibility,
} from '@/lib/analytics/viewPreferences'
import { PRESENCE_SERIES_KEYS, type PresenceSeriesKey } from '@/lib/analytics/presenceChartUtils'
import type { PortalMessageKey } from '@/i18n/portalKey'
import { Separator } from '@/components/ui/separator'

export type AnalyticsToolbarHub = 'sos' | 'spotify' | 'all'

interface AnalyticsToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  preferences: AnalyticsViewPreferences
  onPreferencesChange: (next: AnalyticsViewPreferences) => void
  onExportCsv?: () => void
  onExportPdf?: () => void
  pdfExporting?: boolean
  storageKey?: string
  hub?: AnalyticsToolbarHub
  helpHref?: string
}

const TAB_LABEL_KEYS: Record<AnalyticsTabId, PortalMessageKey> = {
  streaming: 'analytics_tab_streaming',
  listeners: 'analytics_tab_listeners',
  territories: 'analytics_tab_territories',
  events: 'analytics_tab_events',
  earnings: 'analytics_tab_earnings',
  releases: 'analytics_tab_releases',
  'revenue-mix': 'analytics_tab_revenue_mix',
  press: 'analytics_tab_press',
  settlement: 'analytics_tab_settlement',
  engagement: 'analytics_tab_engagement',
  merch: 'analytics_tab_merch',
}

const SERIES_LABEL_KEYS: Record<PresenceSeriesKey, PortalMessageKey> = {
  listeners: 'analytics_presence_series_listeners',
  followers: 'analytics_presence_series_followers',
  albumTrackPlays: 'analytics_presence_series_track_plays',
  topTracksPlays: 'analytics_presence_series_top_plays',
  lastfm: 'analytics_listeners_lastfm',
  soundcharts: 'analytics_listeners_soundcharts',
}

function tabIdsForHub(hub: AnalyticsToolbarHub): readonly AnalyticsTabId[] {
  if (hub === 'sos') return SOS_ANALYTICS_TAB_IDS
  if (hub === 'spotify') return []
  return ANALYTICS_TAB_IDS
}

export function AnalyticsToolbar({
  searchQuery,
  onSearchChange,
  preferences,
  onPreferencesChange,
  onExportCsv,
  onExportPdf,
  pdfExporting = false,
  storageKey = PORTAL_ANALYTICS_VIEW_STORAGE_KEY,
  hub = 'all',
  helpHref = '/portal/help#analytics',
}: AnalyticsToolbarProps) {
  const t = useTranslations('portal')
  const [local, setLocal] = useState(preferences)
  const tabIds = tabIdsForHub(hub)
  const showPresenceCustomize = hub === 'spotify' || hub === 'all'
  const showTabCustomize = tabIds.length > 0

  useEffect(() => {
    setLocal(preferences)
  }, [preferences])

  const apply = () => {
    saveViewPreferences(storageKey, local)
    onPreferencesChange(local)
  }

  const showSearch = hub !== 'spotify'

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {showSearch ? (
        <div className="relative min-w-0 flex-1">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('analytics_search_placeholder')}
            className="h-9 pl-9"
            aria-label={t('analytics_search_placeholder')}
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}

      <div className="flex shrink-0 flex-wrap gap-2">
        <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
          <Link href={helpHref}>
            <Question size={14} aria-hidden="true" />
            <span className="hidden sm:inline">{t('analytics_help_link')}</span>
          </Link>
        </Button>

        {(showTabCustomize || showPresenceCustomize) && (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <SlidersHorizontal size={14} aria-hidden="true" />
                <span className="hidden xs:inline">{t('analytics_customize_views')}</span>
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-sm" data-lenis-prevent>
              <SheetHeader>
                <SheetTitle>{t('analytics_customize_views')}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-8">
                {showTabCustomize && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{t('analytics_customize_hint')}</p>
                    {tabIds.map((tabId) => (
                      <div key={tabId} className="flex items-center gap-3 py-0.5">
                        <Checkbox
                          id={`tab-${tabId}`}
                          checked={local.tabs[tabId]}
                          onCheckedChange={(checked) =>
                            setLocal((prev) => ({
                              ...prev,
                              tabs: { ...prev.tabs, [tabId]: checked === true },
                            }))
                          }
                        />
                        <Label htmlFor={`tab-${tabId}`} className="cursor-pointer text-sm font-normal">
                          {t(TAB_LABEL_KEYS[tabId])}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}

                {showTabCustomize && showPresenceCustomize && <Separator />}

                {showPresenceCustomize && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">{t('analytics_customize_charts_heading')}</p>
                    <p className="text-xs text-muted-foreground">{t('analytics_customize_charts_hint')}</p>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t('analytics_presence_chart_mode_label')}
                      </Label>
                      <Select
                        value={local.charts.presenceMode}
                        onValueChange={(v) =>
                          setLocal((prev) => ({
                            ...prev,
                            charts: {
                              ...prev.charts,
                              presenceMode: v === 'index' ? 'index' : 'absolute',
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="absolute">
                            {t('analytics_presence_chart_mode_absolute')}
                          </SelectItem>
                          <SelectItem value="index">
                            {t('analytics_presence_chart_mode_index')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <p className="pt-1 text-xs font-medium text-muted-foreground">
                      {t('analytics_customize_series_heading')}
                    </p>
                    {PRESENCE_SERIES_KEYS.map((key) => (
                      <div key={key} className="flex items-center gap-3 py-0.5">
                        <Checkbox
                          id={`series-${key}`}
                          checked={local.charts.presenceSeries[key]}
                          onCheckedChange={(checked) =>
                            setLocal((prev) => ({
                              ...prev,
                              charts: {
                                ...prev.charts,
                                presenceSeries: {
                                  ...prev.charts.presenceSeries,
                                  [key]: checked === true,
                                },
                              },
                            }))
                          }
                        />
                        <Label
                          htmlFor={`series-${key}`}
                          className="cursor-pointer text-sm font-normal"
                        >
                          {t(SERIES_LABEL_KEYS[key])}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}

                <Button size="sm" onClick={apply} className="w-full">
                  {t('analytics_customize_apply')}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}

        {onExportCsv && (
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onExportCsv}>
            <DownloadSimple size={14} aria-hidden="true" />
            <span className="hidden sm:inline">{t('analytics_export_csv')}</span>
          </Button>
        )}
        {onExportPdf && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={onExportPdf}
            disabled={pdfExporting}
          >
            <FilePdf size={14} aria-hidden="true" />
            <span className="hidden sm:inline">
              {pdfExporting ? t('analytics_export_pdf_loading') : t('analytics_export_pdf')}
            </span>
          </Button>
        )}
      </div>
    </div>
  )
}

export function usePortalAnalyticsPreferences(
  storageKey: string = PORTAL_ANALYTICS_VIEW_STORAGE_KEY,
): [AnalyticsViewPreferences, (next: AnalyticsViewPreferences) => void] {
  const [prefs, setPrefs] = useState<AnalyticsViewPreferences>(() =>
    loadViewPreferences(storageKey),
  )

  useEffect(() => {
    setPrefs(loadViewPreferences(storageKey))
  }, [storageKey])

  return [prefs, setPrefs]
}

export type { PresenceSeriesVisibility }
