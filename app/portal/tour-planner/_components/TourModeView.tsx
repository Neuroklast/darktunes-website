'use client'

/**
 * Show-day Tour Mode — large, offline-friendly read UI for the active stop.
 * No push; plan in Assistant/Advanced, run the tour here.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  CaretLeft,
  CaretRight,
  MapPin,
  Moon,
  Path,
  FilePdf,
  WifiSlash,
  X,
} from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { useTourPlannerStops, useTourPlannerTours } from '@/lib/tour-planner/hooks'
import {
  dealFrameworkLabel,
  mapsUrl,
  neighborStops,
  pickFocusStop,
  sortStopsChronological,
} from '@/lib/tour-planner/tourMode'
import { evaluateTourReadiness } from '@/lib/tour-planner/tourReadiness'
import { downloadDaySheetPdf } from '@/lib/tour-planner/pdf'
import { buildTourPlannerPdfLabels } from './TourPlannerExtras'
import { portalKey } from '@/i18n/portalKey'
import type { Tour, TourStop } from '@/types'
import { cn } from '@/lib/utils'

interface TourModeViewProps {
  artistId: string
  artistName: string
  initialTours: Tour[]
  initialTourId?: string | null
  initialStopId?: string | null
  onExit: () => void
}

export function TourModeView({
  artistId,
  artistName,
  initialTours,
  initialTourId = null,
  initialStopId = null,
  onExit,
}: TourModeViewProps) {
  const t = useTranslations('portal')
  const { offline } = useOnlineStatus()
  const pdfLabels = useMemo(() => buildTourPlannerPdfLabels(t), [t])

  const [tourId, setTourId] = useState<string | null>(
    initialTourId ?? initialTours.find((x) => !x.archived)?.id ?? initialTours[0]?.id ?? null,
  )
  const [stopId, setStopId] = useState<string | null>(initialStopId)

  const { data: tours = initialTours } = useTourPlannerTours(artistId, initialTours)
  const { data: stops = [] } = useTourPlannerStops(artistId, tourId)

  const tour = tours.find((x) => x.id === tourId) ?? null
  const sorted = useMemo(() => sortStopsChronological(stops), [stops])

  useEffect(() => {
    if (stops.length === 0) {
      setStopId(null)
      return
    }
    const focus = pickFocusStop(stops, { preferredStopId: stopId })
    if (focus && focus.id !== stopId) setStopId(focus.id)
  }, [stops, stopId])

  const current = stopId ? (stops.find((s) => s.id === stopId) ?? null) : null
  const { prev, next } = current
    ? neighborStops(stops, current.id)
    : { prev: null, next: null }

  const readiness = useMemo(
    () => evaluateTourReadiness(tour, stops),
    [tour, stops],
  )
  const stopIssues = useMemo(
    () =>
      readiness.issues.filter(
        (i) => !current || !i.stopId || i.stopId === current.id,
      ).slice(0, 6),
    [current, readiness.issues],
  )

  const maps = current ? mapsUrl(current) : null
  const dealLabel = current ? dealFrameworkLabel(current) : null
  const schedule = current?.daySchedule

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3">
        <div className="mx-auto max-w-lg flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t('tour_mode_badge')}
            </p>
            <h1 className="text-lg font-bold truncate">
              {tour?.name ?? t('tour_mode_no_tour')}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{artistName}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {offline && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <WifiSlash size={12} aria-hidden />
                {t('tour_mode_offline')}
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={onExit}
              aria-label={t('tour_mode_exit')}
            >
              <X size={22} aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-4 space-y-4 pb-24">
        {tours.filter((x) => !x.archived).length > 1 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('tour_mode_select_tour')}</p>
            <select
              className="w-full min-h-12 rounded-md border border-border bg-card px-3 text-base"
              value={tourId ?? ''}
              onChange={(e) => {
                setTourId(e.target.value || null)
                setStopId(null)
              }}
              aria-label={t('tour_mode_select_tour')}
            >
              {tours
                .filter((x) => !x.archived)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {!tour || sorted.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {t('tour_mode_empty')}
            </CardContent>
          </Card>
        ) : current ? (
          <>
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="tabular-nums text-sm px-3 py-1">{current.stopDate}</Badge>
                  {current.isTravelDay ? (
                    <Badge variant="secondary">{t('tour_mode_travel')}</Badge>
                  ) : (
                    <Badge variant="outline">{current.showStatus}</Badge>
                  )}
                </div>
                <CardTitle className="text-2xl leading-tight">
                  {current.isTravelDay
                    ? t('tour_mode_travel')
                    : (current.venueName ?? t('tour_mode_show'))}
                </CardTitle>
                {!current.isTravelDay && (current.venueCity || current.venueCountry) && (
                  <p className="text-base text-muted-foreground flex items-center gap-2">
                    <MapPin size={18} className="shrink-0" aria-hidden />
                    {[current.venueCity, current.venueCountry].filter(Boolean).join(', ')}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-base">
                {!current.isTravelDay && current.venueAddress && (
                  <p className="text-muted-foreground">{current.venueAddress}</p>
                )}

                {!current.isTravelDay && schedule && (
                  <dl className="grid grid-cols-2 gap-3">
                    {schedule.getIn && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('tour_planner_day_getIn')}</dt>
                        <dd className="text-xl font-semibold tabular-nums">{schedule.getIn}</dd>
                      </div>
                    )}
                    {schedule.soundcheck && (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t('tour_planner_day_soundcheck')}
                        </dt>
                        <dd className="text-xl font-semibold tabular-nums">{schedule.soundcheck}</dd>
                      </div>
                    )}
                    {schedule.doors && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('tour_planner_day_doors')}</dt>
                        <dd className="text-xl font-semibold tabular-nums">{schedule.doors}</dd>
                      </div>
                    )}
                    {schedule.stageTime && (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          {t('tour_planner_day_stageTime')}
                        </dt>
                        <dd className="text-2xl font-bold tabular-nums text-primary">
                          {schedule.stageTime}
                        </dd>
                      </div>
                    )}
                    {schedule.curfew && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t('tour_planner_day_curfew')}</dt>
                        <dd className="text-xl font-semibold tabular-nums">{schedule.curfew}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {!current.isTravelDay && (current.hotelName || current.hotelCity) && (
                  <div className="flex items-start gap-2 rounded-md border border-border bg-card/80 p-3">
                    <Moon size={20} className="shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="text-xs text-muted-foreground">{t('tour_mode_hotel')}</p>
                      <p className="font-medium">
                        {[current.hotelName, current.hotelCity].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                )}

                {dealLabel && (
                  <div className="rounded-md border border-border bg-card/80 p-3">
                    <p className="text-xs text-muted-foreground">{t('tour_mode_deal')}</p>
                    <p className="font-medium">{dealLabel}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  {maps && (
                    <Button asChild size="lg" className="min-h-12 w-full text-base">
                      <a href={maps} target="_blank" rel="noopener noreferrer">
                        <Path size={20} className="mr-2" aria-hidden />
                        {t('tour_mode_open_maps')}
                      </a>
                    </Button>
                  )}
                  {!current.isTravelDay && (
                    <Button
                      type="button"
                      size="lg"
                      variant="secondary"
                      className="min-h-12 w-full text-base"
                      onClick={() =>
                        downloadDaySheetPdf(current, schedule ?? {}, pdfLabels)
                      }
                    >
                      <FilePdf size={20} className="mr-2" aria-hidden />
                      {t('tour_mode_day_sheet')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {stopIssues.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">{t('tour_mode_checks')}</h2>
                <ul className="space-y-2">
                  {stopIssues.map((issue) => (
                    <li
                      key={issue.id}
                      className={cn(
                        'rounded-md border px-3 py-2 text-sm',
                        issue.severity === 'error' && 'border-destructive/40 bg-destructive/5',
                        issue.severity === 'warning' && 'border-amber-500/30 bg-amber-500/5',
                        issue.severity === 'info' && 'border-border bg-muted/20',
                      )}
                    >
                      <p className="font-medium">{t(portalKey(issue.titleKey))}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(portalKey(issue.bodyKey), issue.values)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sorted.length > 1 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">{t('tour_mode_all_stops')}</h2>
                <ul className="space-y-1">
                  {sorted.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setStopId(s.id)}
                        className={cn(
                          'w-full text-left rounded-md border px-3 py-3 min-h-12 text-sm',
                          s.id === current.id
                            ? 'border-primary bg-primary/10 font-medium'
                            : 'border-border bg-card hover:bg-muted/40',
                        )}
                      >
                        <span className="tabular-nums text-muted-foreground mr-2">
                          {s.stopDate}
                        </span>
                        {s.isTravelDay
                          ? t('tour_mode_travel')
                          : (s.venueName ?? s.venueCity ?? t('tour_mode_show'))}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : null}
      </div>

      <footer className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
        <div className="mx-auto max-w-lg flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-12 flex-1"
            disabled={!prev}
            onClick={() => prev && setStopId(prev.id)}
          >
            <CaretLeft size={20} aria-hidden />
            {t('tour_mode_prev')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-12 flex-1"
            disabled={!next}
            onClick={() => next && setStopId(next.id)}
          >
            {t('tour_mode_next')}
            <CaretRight size={20} aria-hidden />
          </Button>
        </div>
      </footer>
    </div>
  )
}
