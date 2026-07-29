'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MapTrifold, Plus, ListChecks, Path } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PortalEmptyState } from '@/components/portal/PortalEmptyState'
import { GuidedModeChooser } from '@/components/guided/GuidedModeChooser'
import { parseTourPlannerJson, tourPlannerFetch, wasQueuedOffline } from '@/lib/tour-planner/clientApi'
import { useTourPlannerStops, useTourPlannerTours } from '@/lib/tour-planner/hooks'
import { tourPlannerKeys } from '@/lib/tour-planner/keys'
import { appendStopToCache, appendTourToCache } from '@/lib/tour-planner/offline/cacheUpdates'
import { DEFAULT_TOUR_PLANNER_SETTINGS } from '@/lib/tour-planner/types'
import type { Concert, Tour } from '@/types'
import { TourPlannerTabs } from './TourPlannerPanels'
import { TourPlannerOfflineBanner } from './TourPlannerOfflineBanner'
import {
  TourProductionWizard,
  loadTourPlannerMode,
  saveTourPlannerMode,
  type TourPlannerUiMode,
} from './TourProductionWizard'
import { TourModeView } from './TourModeView'

interface TourPlannerShellProps {
  artistId: string
  artistName: string
  initialTours: Tour[]
  concerts: Concert[]
  /** Deep link: `tour` opens show-day mode */
  initialViewMode?: 'tour' | null
  initialTourId?: string | null
  initialStopId?: string | null
}

export function TourPlannerShell({
  artistId,
  artistName,
  initialTours,
  concerts,
  initialViewMode = null,
  initialTourId = null,
  initialStopId = null,
}: TourPlannerShellProps) {
  const t = useTranslations('portal')
  const queryClient = useQueryClient()
  const [uiMode, setUiMode] = useState<TourPlannerUiMode>('chooser')
  const [tourModeOpen, setTourModeOpen] = useState(initialViewMode === 'tour')
  const [activeTourId, setActiveTourId] = useState<string | null>(
    initialTourId ?? initialTours[0]?.id ?? null,
  )
  const [newTourName, setNewTourName] = useState('')
  const [newStopDate, setNewStopDate] = useState('')
  const [newStopVenue, setNewStopVenue] = useState('')

  useEffect(() => {
    if (initialViewMode === 'tour') {
      setTourModeOpen(true)
      return
    }
    setUiMode(loadTourPlannerMode())
  }, [initialViewMode])

  const { data: tours = initialTours } = useTourPlannerTours(artistId, initialTours)
  const { data: stops = [] } = useTourPlannerStops(artistId, activeTourId)

  useEffect(() => {
    if (activeTourId && !tours.some((tour) => tour.id === activeTourId)) {
      setActiveTourId(tours[0]?.id ?? null)
    }
  }, [activeTourId, tours])

  const invalidateTours = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: tourPlannerKeys.tours(artistId) })
  }, [artistId, queryClient])

  const invalidateStops = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: tourPlannerKeys.stops(artistId, activeTourId) })
  }, [activeTourId, artistId, queryClient])

  const toastSaved = useCallback(
    (offline: boolean) => {
      toast.success(offline ? t('tour_planner_saved_offline') : t('tour_planner_tour_created'))
    },
    [t],
  )

  const createTourMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await tourPlannerFetch(artistId, '/tours', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Failed to create tour')
      const offline = wasQueuedOffline(res)
      const json = offline ? null : await parseTourPlannerJson<{ tour: Tour }>(res)
      return { tour: json?.tour ?? null, offline }
    },
    onSuccess: ({ tour, offline }, name) => {
      if (offline && !tour) {
        const optimistic: Tour = {
          id: `offline-${crypto.randomUUID()}`,
          artistId,
          name,
          description: null,
          startDate: null,
          endDate: null,
          archived: false,
          sortOrder: tours.length,
          settings: DEFAULT_TOUR_PLANNER_SETTINGS,
          routeCache: null,
          budget: null,
          techDocuments: [],
          currency: 'EUR',
          totalBudget: null,
          createdBy: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        appendTourToCache(queryClient, artistId, optimistic)
        setActiveTourId(optimistic.id)
      } else {
        invalidateTours()
        if (tour) setActiveTourId(tour.id)
      }
      setNewTourName('')
      toastSaved(offline)
    },
    onError: () => toast.error(t('tour_planner_error')),
  })

  const createStopMutation = useMutation({
    mutationFn: async () => {
      if (!activeTourId) throw new Error('No active tour')
      const res = await tourPlannerFetch(artistId, '/stops', {
        method: 'POST',
        body: JSON.stringify({
          tourId: activeTourId,
          stopDate: newStopDate,
          venueName: newStopVenue || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to create stop')
      const offline = wasQueuedOffline(res)
      const json = offline ? null : await parseTourPlannerJson<{ stop: import('@/types').TourStop }>(res)
      return { stop: json?.stop ?? null, offline }
    },
    onSuccess: ({ stop, offline }) => {
      if (offline && stop && activeTourId) {
        appendStopToCache(queryClient, artistId, activeTourId, stop)
      } else if (stop && activeTourId) {
        appendStopToCache(queryClient, artistId, activeTourId, stop)
      } else {
        invalidateStops()
      }
      setNewStopDate('')
      setNewStopVenue('')
      toast.success(offline ? t('tour_planner_saved_offline') : t('tour_planner_stop_created'))
    },
    onError: () => toast.error(t('tour_planner_error')),
  })

  const activeTour = tours.find((tour) => tour.id === activeTourId) ?? null

  const handleCreateTour = useCallback(() => {
    const name = newTourName.trim()
    if (!name) return
    createTourMutation.mutate(name)
  }, [createTourMutation, newTourName])

  const handleTourDeleted = useCallback(() => {
    invalidateTours()
    setActiveTourId(null)
    toast.success(t('tour_planner_tour_deleted'))
  }, [invalidateTours, t])

  const selectMode = (mode: 'assistant' | 'advanced') => {
    saveTourPlannerMode(mode)
    setUiMode(mode)
    setTourModeOpen(false)
  }

  const openTourMode = () => {
    setTourModeOpen(true)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('mode', 'tour')
      if (activeTourId) url.searchParams.set('tourId', activeTourId)
      window.history.replaceState({}, '', url.toString())
    }
  }

  const exitTourMode = () => {
    setTourModeOpen(false)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('mode')
      url.searchParams.delete('stopId')
      window.history.replaceState({}, '', url.toString())
    }
    if (uiMode === 'chooser') setUiMode(loadTourPlannerMode())
  }

  if (tourModeOpen) {
    return (
      <TourModeView
        artistId={artistId}
        artistName={artistName}
        initialTours={tours}
        initialTourId={activeTourId}
        initialStopId={initialStopId}
        onExit={exitTourMode}
      />
    )
  }

  if (uiMode === 'chooser') {
    return (
      <div className="space-y-6">
        <TourPlannerOfflineBanner />
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <MapTrifold size={28} className="text-primary" aria-hidden />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('tour_planner_heading')}</h1>
              <p className="text-muted-foreground text-sm">
                {t('tour_planner_subheading', { artist: artistName })}
              </p>
            </div>
          </div>
        </header>
        <GuidedModeChooser
          title={t('tour_guide_mode_title')}
          subtitle={t('tour_guide_mode_subtitle')}
          recommendedLabel={t('tour_guide_recommended')}
          assistantTitle={t('tour_guide_mode_assistant_title')}
          assistantDesc={t('tour_guide_mode_assistant_desc')}
          assistantButton={t('tour_guide_mode_assistant_btn')}
          advancedTitle={t('tour_guide_mode_advanced_title')}
          advancedDesc={t('tour_guide_mode_advanced_desc')}
          advancedButton={t('tour_guide_mode_advanced_btn')}
          whatNextTitle={t('tour_guide_mode_what_next')}
          whatNextSteps={[
            t('tour_guide_mode_next_1'),
            t('tour_guide_mode_next_2'),
            t('tour_guide_mode_next_3'),
          ]}
          onSelect={selectMode}
        />
      </div>
    )
  }

  if (uiMode === 'assistant') {
    return (
      <div className="space-y-6">
        <TourPlannerOfflineBanner />
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ListChecks size={28} className="text-primary" aria-hidden />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('tour_guide_heading')}</h1>
              <p className="text-muted-foreground text-sm">{t('tour_guide_subheading')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tours.length > 0 && (
              <Select value={activeTourId ?? undefined} onValueChange={setActiveTourId}>
                <SelectTrigger className="w-[200px]" aria-label={t('tour_planner_select_tour')}>
                  <SelectValue placeholder={t('tour_planner_select_tour')} />
                </SelectTrigger>
                <SelectContent>
                  {tours.map((tour) => (
                    <SelectItem key={tour.id} value={tour.id}>
                      {tour.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {tours.length > 0 && (
              <Button type="button" variant="secondary" onClick={openTourMode}>
                <Path size={16} className="mr-2" aria-hidden />
                {t('tour_mode_enter')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => selectMode('advanced')}>
              {t('tour_guide_switch_advanced')}
            </Button>
          </div>
        </header>
        <TourProductionWizard
          artistId={artistId}
          artistName={artistName}
          initialTours={tours}
          concerts={concerts}
          activeTour={activeTour}
          stops={stops}
          onTourCreated={(id) => {
            setActiveTourId(id)
            invalidateTours()
          }}
          onOpenAdvanced={() => selectMode('advanced')}
          onRefresh={() => {
            invalidateTours()
            invalidateStops()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <TourPlannerOfflineBanner />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MapTrifold size={28} className="text-primary" aria-hidden />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('tour_planner_heading')}</h1>
              <p className="text-muted-foreground text-sm">
                {t('tour_planner_subheading', { artist: artistName })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tours.length > 0 && (
              <Button type="button" variant="default" onClick={openTourMode}>
                <Path size={16} className="mr-2" aria-hidden />
                {t('tour_mode_enter')}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => selectMode('assistant')}>
              <ListChecks size={16} className="mr-2" aria-hidden />
              {t('tour_guide_open_guide')}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">{t('tour_planner_intro')}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h2 className="font-semibold">{t('tour_planner_tours_heading')}</h2>
          <div className="flex gap-2">
            <Input
              value={newTourName}
              onChange={(e) => setNewTourName(e.target.value)}
              placeholder={t('tour_planner_new_tour_placeholder')}
              aria-label={t('tour_planner_new_tour_placeholder')}
            />
            <Button onClick={handleCreateTour} disabled={createTourMutation.isPending}>
              <Plus size={16} aria-hidden />
              {t('tour_planner_create_tour')}
            </Button>
          </div>

          {tours.length === 0 ? (
            <PortalEmptyState
              icon={MapTrifold}
              heading={t('tour_planner_no_tours')}
              description={t('tour_planner_no_tours_desc')}
            />
          ) : (
            <Select value={activeTourId ?? undefined} onValueChange={setActiveTourId}>
              <SelectTrigger aria-label={t('tour_planner_select_tour')}>
                <SelectValue placeholder={t('tour_planner_select_tour')} />
              </SelectTrigger>
              <SelectContent>
                {tours.map((tour) => {
                  const coTour =
                    (tour.collaborators?.length ?? 0) > 0 || tour.accessRole === 'collaborator'
                  const label = [
                    tour.name,
                    tour.archived ? `(${t('tour_planner_archived_label')})` : null,
                    coTour ? `· ${t('tour_planner_co_tour_badge')}` : null,
                    tour.accessRole === 'collaborator' && tour.ownerArtistName
                      ? `(${tour.ownerArtistName})`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <SelectItem key={tour.id} value={tour.id}>
                      {label}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-4 rounded-lg border border-border p-4">
          <h2 className="font-semibold">{t('tour_planner_stops_heading')}</h2>
          {!activeTour ? (
            <p className="text-sm text-muted-foreground">{t('tour_planner_select_tour_first')}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <DateField
                  id="new-stop-date"
                  label={t('tour_planner_stop_date')}
                  value={newStopDate}
                  onChange={setNewStopDate}
                />
                <div className="space-y-1">
                  <Label htmlFor="new-stop-venue">{t('tour_planner_stop_venue')}</Label>
                  <Input
                    id="new-stop-venue"
                    value={newStopVenue}
                    onChange={(e) => setNewStopVenue(e.target.value)}
                    placeholder={t('tour_planner_stop_venue_placeholder')}
                  />
                </div>
              </div>
              <Button
                onClick={() => createStopMutation.mutate()}
                disabled={!newStopDate || createStopMutation.isPending}
              >
                <Plus size={16} aria-hidden />
                {t('tour_planner_add_stop')}
              </Button>

              {stops.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('tour_planner_no_stops')}</p>
              )}
            </>
          )}
        </div>
      </section>

      {activeTour && (
        <TourPlannerTabs
          artistId={artistId}
          artistName={artistName}
          activeTour={activeTour}
          stops={stops}
          concerts={concerts}
          onStopsChange={invalidateStops}
          onTourChange={invalidateTours}
          onTourDeleted={handleTourDeleted}
        />
      )}
    </div>
  )
}
