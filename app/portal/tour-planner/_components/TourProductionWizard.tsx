'use client'

/**
 * Guided tour production wizard — create + readiness + share/export.
 */

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GuidedStepShell } from '@/components/guided/GuidedStepShell'
import type { GuidedStepDef } from '@/lib/guided/guidedSteps'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { parseTourPlannerJson, tourPlannerFetch, wasQueuedOffline } from '@/lib/tour-planner/clientApi'
import { tourPlannerKeys } from '@/lib/tour-planner/keys'
import { appendTourToCache, appendStopToCache } from '@/lib/tour-planner/offline/cacheUpdates'
import {
  DEFAULT_TOUR_PLANNER_SETTINGS,
  type PlanningMode,
  type VehicleType,
} from '@/lib/tour-planner/types'
import {
  deriveTourDateRange,
  evaluateTourReadiness,
  filterImportableConcerts,
  suggestTourName,
} from '@/lib/tour-planner/tourReadiness'
import { downloadTourItineraryPdf, downloadTourProductionPackPdf } from '@/lib/tour-planner/pdf'
import { buildTourPlannerPdfLabels } from './TourPlannerExtras'
import { portalKey } from '@/i18n/portalKey'
import type { Concert, Tour, TourStop } from '@/types'
import { cn } from '@/lib/utils'

const STEPS: readonly GuidedStepDef[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'stops', label: 'Dates' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'readiness', label: 'Checks' },
  { id: 'share', label: 'Share' },
]

const MODE_KEY = 'portal-tour-planner-mode-v1'

export type TourPlannerUiMode = 'chooser' | 'assistant' | 'advanced'

export function loadTourPlannerMode(): TourPlannerUiMode {
  if (typeof window === 'undefined') return 'chooser'
  try {
    const v = localStorage.getItem(MODE_KEY)
    if (v === 'assistant' || v === 'advanced') return v
  } catch {
    /* ignore */
  }
  return 'chooser'
}

export function saveTourPlannerMode(mode: 'assistant' | 'advanced'): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

interface TourProductionWizardProps {
  artistId: string
  artistName: string
  initialTours: Tour[]
  concerts: Concert[]
  activeTour: Tour | null
  stops: TourStop[]
  onTourCreated: (tourId: string) => void
  onOpenAdvanced: () => void
  onRefresh: () => void
}

export function TourProductionWizard({
  artistId,
  artistName,
  initialTours,
  concerts,
  activeTour,
  stops,
  onTourCreated,
  onOpenAdvanced,
  onRefresh,
}: TourProductionWizardProps) {
  const t = useTranslations('portal')
  const queryClient = useQueryClient()
  const pdfLabels = useMemo(() => buildTourPlannerPdfLabels(t), [t])

  const [stepId, setStepId] = useState('basics')
  const [maxReachable, setMaxReachable] = useState(0)

  const [name, setName] = useState(
    activeTour?.name ?? suggestTourName(artistName),
  )
  const [description, setDescription] = useState(activeTour?.description ?? '')
  const [currency, setCurrency] = useState(activeTour?.currency ?? 'EUR')
  const [selectedConcertIds, setSelectedConcertIds] = useState<Set<string>>(new Set())
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    activeTour?.settings?.vehicleType ?? DEFAULT_TOUR_PLANNER_SETTINGS.vehicleType,
  )
  const [planningMode, setPlanningMode] = useState<PlanningMode>(
    activeTour?.settings?.planningMode ?? DEFAULT_TOUR_PLANNER_SETTINGS.planningMode,
  )
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [localTourId, setLocalTourId] = useState<string | null>(activeTour?.id ?? null)

  const workingTour =
    activeTour ??
    (localTourId ? initialTours.find((x) => x.id === localTourId) ?? null : null) ??
    null
  // Prefer prop stops; fall back empty when tour just created
  const workingStops = stops

  const importable = useMemo(
    () =>
      filterImportableConcerts(
        concerts.map((c) => ({
          id: c.id,
          concertDate: c.concertDate,
          eventName: c.eventName,
          venueName: c.venueName,
          venueCity: c.venueCity,
        })),
        workingStops,
        { fromDate: new Date().toISOString().slice(0, 10) },
      ),
    [concerts, workingStops],
  )

  const readiness = useMemo(
    () => evaluateTourReadiness(workingTour, workingStops),
    [workingTour, workingStops],
  )

  const stepIndex = STEPS.findIndex((s) => s.id === stepId)

  const createTourMutation = useMutation({
    mutationFn: async () => {
      const res = await tourPlannerFetch(artistId, '/tours', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          currency,
        }),
      })
      if (!res.ok) throw new Error('create failed')
      const offline = wasQueuedOffline(res)
      const json = offline ? null : await parseTourPlannerJson<{ tour: Tour }>(res)
      return { tour: json?.tour ?? null, offline }
    },
    onSuccess: ({ tour, offline }) => {
      if (tour) {
        appendTourToCache(queryClient, artistId, tour)
        setLocalTourId(tour.id)
        onTourCreated(tour.id)
      } else {
        void queryClient.invalidateQueries({ queryKey: tourPlannerKeys.tours(artistId) })
      }
      toast.success(offline ? t('tour_planner_saved_offline') : t('tour_guide_tour_created'))
    },
    onError: () => toast.error(t('tour_planner_error')),
  })

  const importSelected = useCallback(async (tourId: string) => {
    let ok = 0
    for (const concertId of selectedConcertIds) {
      try {
        const res = await tourPlannerFetch(artistId, '/stops/import-concert', {
          method: 'POST',
          body: JSON.stringify({ tourId, concertId }),
        })
        if (res.ok) {
          ok += 1
          const offline = wasQueuedOffline(res)
          if (!offline) {
            const json = await parseTourPlannerJson<{ stop: TourStop }>(res)
            if (json?.stop) appendStopToCache(queryClient, artistId, tourId, json.stop)
          }
        }
      } catch {
        /* continue */
      }
    }
    void queryClient.invalidateQueries({ queryKey: tourPlannerKeys.stops(artistId, tourId) })
    if (ok > 0) toast.success(t('tour_guide_imported_stops', { count: ok }))
    onRefresh()
  }, [artistId, onRefresh, queryClient, selectedConcertIds, t])

  const patchTourDefaults = useCallback(async () => {
    if (!workingTour) return
    const range = deriveTourDateRange(workingStops)
    const res = await tourPlannerFetch(artistId, `/tours/${workingTour.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        currency,
        startDate: range.startDate,
        endDate: range.endDate,
        settings: {
          ...workingTour.settings,
          vehicleType,
          planningMode,
        },
      }),
    })
    if (!res.ok) throw new Error('patch failed')
    void queryClient.invalidateQueries({ queryKey: tourPlannerKeys.tours(artistId) })
    onRefresh()
  }, [
    artistId,
    currency,
    description,
    name,
    onRefresh,
    planningMode,
    queryClient,
    vehicleType,
    workingStops,
    workingTour,
  ])

  const createShare = async () => {
    if (!workingTour) return
    setShareBusy(true)
    try {
      const res = await tourPlannerFetch(artistId, `/tours/${workingTour.id}/share`, {
        method: 'POST',
        body: JSON.stringify({ label: t('tour_guide_share_default_label') }),
      })
      if (!res.ok) throw new Error('share failed')
      const json = (await res.json()) as { link: { url: string; token: string } }
      const absolute =
        typeof window !== 'undefined'
          ? `${window.location.origin}${json.link.url}`
          : json.link.url
      setShareUrl(absolute)
      toast.success(t('tour_guide_share_created'))
    } catch {
      toast.error(t('tour_planner_error'))
    } finally {
      setShareBusy(false)
    }
  }

  const copyShare = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(t('tour_guide_share_copied'))
    } catch {
      toast.error(t('tour_planner_error'))
    }
  }

  const canContinue = useMemo(() => {
    if (stepId === 'basics') return name.trim().length > 0
    if (stepId === 'stops') {
      return Boolean(workingTour) && (workingStops.length > 0 || selectedConcertIds.size > 0)
    }
    if (stepId === 'defaults') return Boolean(workingTour)
    if (stepId === 'readiness') return Boolean(workingTour) && !readiness.hardBlocked
    return true
  }, [name, readiness.hardBlocked, selectedConcertIds.size, stepId, workingStops.length, workingTour])

  const blockedReason = useMemo(() => {
    if (stepId === 'basics' && !name.trim()) return t('tour_guide_need_name')
    if (stepId === 'stops' && !workingTour && selectedConcertIds.size === 0)
      return t('tour_guide_need_stops')
    if (stepId === 'readiness' && readiness.hardBlocked)
      return t('tour_guide_need_fix_errors')
    return null
  }, [name, readiness.hardBlocked, selectedConcertIds.size, stepId, t, workingTour])

  const coachChecks = useMemo(() => {
    if (stepId !== 'readiness') return undefined
    return readiness.issues.slice(0, 8).map((issue) => ({
      id: issue.id,
      label: t(portalKey(issue.titleKey)),
      done: issue.severity === 'info',
    }))
  }, [readiness.issues, stepId, t])

  const goNext = async () => {
    try {
      if (stepId === 'basics') {
        if (!workingTour) {
          const { tour } = await createTourMutation.mutateAsync()
          if (tour) setLocalTourId(tour.id)
        } else {
          await patchTourDefaults()
        }
      }
      const tourIdForImport = workingTour?.id ?? localTourId
      if (stepId === 'stops' && tourIdForImport && selectedConcertIds.size > 0) {
        await importSelected(tourIdForImport)
        setSelectedConcertIds(new Set())
      }
      if (stepId === 'defaults' && workingTour) {
        await patchTourDefaults()
      }
      if (stepId === 'share') {
        onOpenAdvanced()
        return
      }
      const next = STEPS[stepIndex + 1]
      if (next) {
        setStepId(next.id)
        setMaxReachable((m) => Math.max(m, stepIndex + 1))
      }
    } catch {
      toast.error(t('tour_planner_error'))
    }
  }

  const goBack = () => {
    if (stepIndex <= 0) return
    setStepId(STEPS[stepIndex - 1]!.id)
  }

  const toggleConcert = (id: string) => {
    setSelectedConcertIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stepLabels = STEPS.map((s) => ({
    ...s,
    label: t(portalKey(`tour_guide_step_${s.id}`)),
  }))

  return (
    <GuidedStepShell
      steps={stepLabels}
      activeStepId={stepId}
      onStepChange={(id) => setStepId(id)}
      maxReachableIndex={maxReachable}
      coachTitle={t(portalKey(`tour_guide_coach_${stepId}_title`))}
      coachBody={t(portalKey(`tour_guide_coach_${stepId}_body`))}
      coachChecks={coachChecks}
      blockedReason={blockedReason}
      canContinue={canContinue && !createTourMutation.isPending}
      onBack={goBack}
      onNext={() => void goNext()}
      backLabel={t('tour_guide_back')}
      nextLabel={
        stepId === 'share' ? t('tour_guide_finish') : t('tour_guide_continue')
      }
      isLastStep={stepId === 'share'}
      onSwitchToAdvanced={onOpenAdvanced}
      switchAdvancedLabel={t('tour_guide_switch_advanced')}
      stepOfLabel={(c, total) => t('tour_guide_step_of', { current: c, total })}
    >
      {stepId === 'basics' && (
        <div className="space-y-4 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="tour-name">{t('tour_guide_field_name')}</Label>
            <Input
              id="tour-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tour-desc">{t('tour_guide_field_description')}</Label>
            <Textarea
              id="tour-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('tour_guide_field_currency')}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['EUR', 'GBP', 'USD', 'CHF'].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {stepId === 'stops' && (
        <div className="space-y-4">
          {!workingTour && (
            <p className="text-sm text-amber-600">{t('tour_guide_create_first')}</p>
          )}
          <p className="text-sm text-muted-foreground">{t('tour_guide_stops_intro')}</p>
          {importable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tour_guide_no_concerts')}</p>
          ) : (
            <ul className="space-y-2 max-h-[320px] overflow-y-auto" data-lenis-prevent>
              {importable.map((c) => {
                const full = concerts.find((x) => x.id === c.id)
                return (
                  <li key={c.id}>
                    <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/30">
                      <Checkbox
                        checked={selectedConcertIds.has(c.id)}
                        onCheckedChange={() => toggleConcert(c.id)}
                        disabled={!workingTour}
                      />
                      <span className="text-sm min-w-0">
                        <span className="font-medium tabular-nums">{c.concertDate}</span>
                        {' · '}
                        {full?.eventName ?? full?.venueName ?? c.id}
                        {full?.venueCity ? (
                          <span className="text-muted-foreground"> — {full.venueCity}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          {workingStops.length > 0 && (
            <p className="text-sm">
              {t('tour_guide_existing_stops', { count: workingStops.length })}
            </p>
          )}
        </div>
      )}

      {stepId === 'defaults' && (
        <div className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label>{t('tour_guide_field_vehicle')}</Label>
            <Select
              value={vehicleType}
              onValueChange={(v) => setVehicleType(v as VehicleType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="car">{t('tour_planner_vehicle_car')}</SelectItem>
                <SelectItem value="bus">{t('tour_planner_vehicle_bus')}</SelectItem>
                <SelectItem value="truck">{t('tour_planner_vehicle_truck')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('tour_guide_field_planning')}</Label>
            <Select
              value={planningMode}
              onValueChange={(v) => setPlanningMode(v as PlanningMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fastest">{t('tour_planner_planning_fastest')}</SelectItem>
                <SelectItem value="balanced">{t('tour_planner_planning_balanced')}</SelectItem>
                <SelectItem value="avoid-rush-hour">
                  {t('tour_planner_planning_avoid_rush')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {stepId === 'readiness' && workingTour && (
        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                {t('tour_guide_readiness_score')}
                <Badge
                  variant={readiness.score >= 70 ? 'default' : 'secondary'}
                  className="tabular-nums text-base px-3"
                >
                  {readiness.score}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t('tour_guide_readiness_hint')}
            </CardContent>
          </Card>
          {readiness.issues.length === 0 ? (
            <p className="text-sm text-green-600">{t('tour_guide_readiness_ok')}</p>
          ) : (
            <ul className="space-y-2">
              {readiness.issues.map((issue) => (
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
                  {issue.fixHintKey && (
                    <p className="text-xs mt-1 text-primary">
                      {t(portalKey(issue.fixHintKey))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stepId === 'share' && workingTour && (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-muted-foreground">{t('tour_guide_share_intro')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => downloadTourItineraryPdf(workingTour, workingStops, pdfLabels)}
            >
              {t('tour_guide_export_itinerary')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                downloadTourProductionPackPdf(workingTour, workingStops, pdfLabels)
              }
            >
              {t('tour_guide_export_pack')}
            </Button>
          </div>
          <div className="space-y-2 rounded-md border border-border p-4">
            <p className="text-sm font-medium">{t('tour_guide_share_heading')}</p>
            <p className="text-xs text-muted-foreground">{t('tour_guide_share_hint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={shareBusy} onClick={() => void createShare()}>
                {t('tour_guide_share_create')}
              </Button>
              {shareUrl && (
                <Button type="button" variant="outline" onClick={() => void copyShare()}>
                  {t('tour_guide_share_copy')}
                </Button>
              )}
            </div>
            {shareUrl && (
              <p className="text-xs font-mono break-all text-muted-foreground">{shareUrl}</p>
            )}
          </div>
          {initialTours.length > 0 && (
            <p className="text-xs text-muted-foreground">{t('tour_guide_manage_advanced_hint')}</p>
          )}
        </div>
      )}
    </GuidedStepShell>
  )
}
