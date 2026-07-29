'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import { Textarea } from '@/components/ui/textarea'
import { tourPlannerFetch, wasQueuedOffline } from '@/lib/tour-planner/clientApi'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { downloadFile, exportToCSV, exportToText } from '@/lib/tour-planner/export'
import { useTourPlannerCrew, useTourPlannerMerch } from '@/lib/tour-planner/hooks'
import { tourPlannerKeys } from '@/lib/tour-planner/keys'
import { dbStopToTrack } from '@/lib/tour-planner/mappers'
import {
  downloadMerchSettlementPdf,
  downloadSettlementPdf,
  downloadTourItineraryPdf,
  type TourPlannerPdfLabels,
} from '@/lib/tour-planner/pdf'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  DealStructure,
  GuestListEntry,
  MerchComp,
  MerchSettlement,
  MerchVariant,
  PlanningMode,
  Settlement,
  TourBudget,
  TourPlannerSettings,
  VehicleType,
  VenueContactInfo,
  VenueDetails,
} from '@/lib/tour-planner/types'
import { EMPTY_TOUR_BUDGET } from '@/lib/tour-planner/types'
import type { Concert, Tour, TourCrewMember, TourMerchItem, TourStop } from '@/types'
import { MapVisualization } from './MapVisualization'
import { BudgetForm, TechDocumentsForm } from './TourPlannerProductionForms'

type PortalTranslator = ReturnType<typeof useTranslations<'portal'>>

export function buildTourPlannerPdfLabels(t: PortalTranslator): TourPlannerPdfLabels {
  return {
    daySheet: t('tour_planner_day_sheet'),
    schedule: t('tour_planner_pdf_schedule'),
    venue: t('tour_planner_stop_venue'),
    date: t('tour_planner_stop_date'),
    show: t('tour_planner_unnamed_stop'),
    tbd: t('tour_planner_pdf_tbd'),
    getIn: t('tour_planner_day_getIn'),
    soundcheck: t('tour_planner_day_soundcheck'),
    doors: t('tour_planner_day_doors'),
    stageTime: t('tour_planner_day_stageTime'),
    curfew: t('tour_planner_day_curfew'),
    settlement: t('tour_planner_settlement'),
    ticketsSold: t('tour_planner_settlement_ticketsSold'),
    ticketPrice: t('tour_planner_settlement_ticketPrice'),
    grossRevenue: t('tour_planner_settlement_grossRevenue'),
    venueCosts: t('tour_planner_settlement_venueCosts'),
    netRevenue: t('tour_planner_settlement_netRevenue'),
    artistPayment: t('tour_planner_settlement_artistPayment'),
    notes: t('tour_planner_notes'),
    merchSettlement: t('tour_planner_merch_settlement'),
    hallFee: t('tour_planner_merch_hall_fee'),
    itemsSold: t('tour_planner_merch_items_sold'),
    signedAt: t('tour_planner_pdf_signed_at'),
    signature: t('tour_planner_pdf_signature'),
    itinerary: t('tour_guide_export_itinerary'),
    status: t('tour_planner_show_status_label'),
    hotel: t('tour_planner_hotel_name'),
    travelDay: t('tour_planner_travel_day_label'),
    deal: t('tour_planner_deal_type'),
  }
}

export type GeocodeResult =
  | { status: 'ok'; lat: number; lng: number }
  | { status: 'queued' }
  | { status: 'fail' }

export function MapRoutePanel({ artistId, activeTour, stops }: { artistId: string; activeTour: Tour | null; stops: TourStop[] }) {
  const t = useTranslations('portal')
  const qc = useQueryClient()
  const { offline } = useOnlineStatus()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeTour) throw new Error('no tour')
      const res = await tourPlannerFetch(artistId, '/route', { method: 'POST', body: JSON.stringify({ tourId: activeTour.id }) })
      if (!res.ok) throw new Error('route failed')
      return wasQueuedOffline(res)
    },
    onSuccess: (offline) => {
      void qc.invalidateQueries({ queryKey: tourPlannerKeys.tours(artistId) })
      toast.success(offline ? t('tour_planner_saved_offline') : t('tour_planner_route_done'))
    },
    onError: () => toast.error(t('tour_planner_error')),
  })
  const route = activeTour?.routeCache
  const trackStops = stops.map(dbStopToTrack)

  const exportLabels = {
    appTitle: t('tour_planner_heading'),
    tourStops: t('tour_planner_stops_heading'),
    venueName: t('tour_planner_stop_venue'),
    venueAddress: t('tour_planner_venue_address'),
    venueCity: t('tour_planner_venue_city'),
    venueCountry: t('tour_planner_venue_country'),
    hotelName: t('tour_planner_hotel_name'),
    hotelAddress: t('tour_planner_hotel_address'),
    hotelCity: t('tour_planner_hotel_city'),
    hotelCountry: t('tour_planner_hotel_country'),
    routeResults: t('tour_planner_route_results'),
    from: t('tour_planner_route_from'),
    to: t('tour_planner_route_to'),
    distance: t('tour_planner_route_distance'),
    duration: t('tour_planner_route_duration'),
    totalDistance: t('tour_planner_route_total_distance'),
    totalDuration: t('tour_planner_route_total_duration'),
    hours: t('tour_planner_hours'),
    minutes: t('tour_planner_minutes'),
    segmentStart: t('tour_planner_segment_start'),
    segmentToVenue: t('tour_planner_segment_to_venue'),
    segmentToHotel: t('tour_planner_segment_to_hotel'),
    segmentToNextHotel: t('tour_planner_segment_to_next_hotel'),
    date: t('tour_planner_stop_date'),
    type: t('tour_planner_route_type'),
  }

  const exportCsv = () => {
    const csv = exportToCSV(trackStops, route ?? null, exportLabels)
    downloadFile(csv, `${activeTour?.name ?? 'tour'}-stops.csv`, 'text/csv')
    toast.success(t('tour_planner_export_done'))
  }

  const exportText = () => {
    const text = exportToText(trackStops, route ?? null, exportLabels)
    downloadFile(text, `${activeTour?.name ?? 'tour'}-stops.txt`, 'text/plain')
    toast.success(t('tour_planner_export_done'))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!activeTour || mutation.isPending || offline}
          title={offline ? t('tour_planner_offline_unavailable') : undefined}
          onClick={() => mutation.mutate()}
        >
          {t('tour_planner_calc_route')}
        </Button>
        {offline && (
          <p className="w-full text-sm text-muted-foreground">{t('tour_planner_route_offline_hint')}</p>
        )}
        {trackStops.length > 0 && (
          <>
            <Button variant="outline" onClick={exportCsv}>{t('tour_planner_export_csv')}</Button>
            <Button variant="outline" onClick={exportText}>{t('tour_planner_export_text')}</Button>
            {activeTour && (
              <Button
                variant="outline"
                onClick={() => downloadTourItineraryPdf(activeTour, stops, buildTourPlannerPdfLabels(t))}
              >
                {t('tour_guide_export_itinerary')}
              </Button>
            )}
          </>
        )}
      </div>
      {route?.error && <p className="text-sm text-destructive">{route.error}</p>}
      {route && !route.error && (
        <p className="text-sm text-muted-foreground">
          {t('tour_planner_route_summary', { km: Math.round(route.totalDistance / 1000), min: Math.round(route.totalDuration / 60) })}
        </p>
      )}
      {trackStops.length > 0 && (
        <MapVisualization
          stops={trackStops}
          route={route ?? null}
          labels={{
            title: t('tour_planner_map_title'),
            reset: t('tour_planner_map_reset'),
            zoomIn: t('tour_planner_map_zoom_in'),
            zoomOut: t('tour_planner_map_zoom_out'),
            start: t('tour_planner_map_start'),
            hotel: t('tour_planner_hotel_name'),
            venue: t('tour_planner_stop_venue'),
            travel: t('tour_planner_map_travel'),
          }}
        />
      )}
    </div>
  )
}

function CrewMemberForm({
  member,
  onSave,
}: {
  member: Partial<TourCrewMember> & { name: string; role: string }
  onSave: (body: Record<string, unknown>) => void
}) {
  const t = useTranslations('portal')
  const [draft, setDraft] = useState({
    name: member.name,
    role: member.role,
    email: member.email ?? '',
    phone: member.phone ?? '',
    passportNumber: member.passportNumber ?? '',
    passportExpiry: member.passportExpiry ?? '',
    nationality: member.nationality ?? '',
    visaInfo: member.visaInfo ?? '',
    roomAssignment: member.roomAssignment ?? '',
    busAssignment: member.busAssignment ?? '',
  })
  return (
    <div className="grid gap-2 sm:grid-cols-2 text-sm">
      <Input placeholder={t('tour_planner_crew_name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <Input placeholder={t('tour_planner_crew_role')} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
      <Input placeholder={t('tour_planner_contact_email')} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
      <Input placeholder={t('tour_planner_contact_phone')} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
      <Input placeholder={t('tour_planner_passport_number')} value={draft.passportNumber} onChange={(e) => setDraft({ ...draft, passportNumber: e.target.value })} />
      <DateField
        id="tour-passport-expiry"
        value={draft.passportExpiry}
        onChange={(v) => setDraft({ ...draft, passportExpiry: v })}
        aria-label={t('tour_planner_passport_expiry')}
      />
      <Input placeholder={t('tour_planner_nationality')} value={draft.nationality} onChange={(e) => setDraft({ ...draft, nationality: e.target.value })} />
      <Input placeholder={t('tour_planner_visa_info')} value={draft.visaInfo} onChange={(e) => setDraft({ ...draft, visaInfo: e.target.value })} />
      <Input placeholder={t('tour_planner_room_assignment')} value={draft.roomAssignment} onChange={(e) => setDraft({ ...draft, roomAssignment: e.target.value })} />
      <Input placeholder={t('tour_planner_bus_assignment')} value={draft.busAssignment} onChange={(e) => setDraft({ ...draft, busAssignment: e.target.value })} />
      <Button className="sm:col-span-2" onClick={() => onSave({
        name: draft.name,
        role: draft.role,
        email: draft.email || null,
        phone: draft.phone || null,
        passportNumber: draft.passportNumber || null,
        passportExpiry: draft.passportExpiry || null,
        nationality: draft.nationality || null,
        visaInfo: draft.visaInfo || null,
        roomAssignment: draft.roomAssignment || null,
        busAssignment: draft.busAssignment || null,
      })}>{t('tour_planner_save')}</Button>
    </div>
  )
}

export function CrewPanel({ artistId, tourId }: { artistId: string; tourId: string | null }) {
  const t = useTranslations('portal')
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const { data: crew = [] } = useTourPlannerCrew(artistId, tourId)
  if (!tourId) return null

  const saveMember = async (memberId: string | null, body: Record<string, unknown>) => {
    const res = await tourPlannerFetch(artistId, memberId ? `/crew/${memberId}` : '/crew', {
      method: memberId ? 'PATCH' : 'POST',
      body: JSON.stringify(memberId ? body : { ...body, tourId }),
    })
    if (!res.ok) throw new Error('crew save')
    void qc.invalidateQueries({ queryKey: tourPlannerKeys.crew(artistId, tourId) })
    setEditing(null)
    setCreating(false)
    toast.success(wasQueuedOffline(res) ? t('tour_planner_saved_offline') : t('tour_planner_saved'))
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={() => setCreating((v) => !v)}>{t('tour_planner_add_crew')}</Button>
      {creating && (
        <CrewMemberForm member={{ name: '', role: '' }} onSave={(body) => saveMember(null, body).catch(() => toast.error(t('tour_planner_error')))} />
      )}
      <ul className="divide-y divide-border rounded-md border">
        {crew.map((m) => (
          <li key={m.id} className="p-3 text-sm space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="text-left hover:underline" onClick={() => setEditing(editing === m.id ? null : m.id)}>
                {m.name} · {m.role}{m.nationality ? ` · ${m.nationality}` : ''}
              </button>
              <Button variant="ghost" size="sm" aria-label={t('tour_planner_delete_crew')} onClick={async () => {
                const res = await tourPlannerFetch(artistId, `/crew/${m.id}`, { method: 'DELETE' })
                if (!res.ok) { toast.error(t('tour_planner_error')); return }
                void qc.invalidateQueries({ queryKey: tourPlannerKeys.crew(artistId, tourId) })
                toast.success(wasQueuedOffline(res) ? t('tour_planner_saved_offline') : t('tour_planner_crew_deleted'))
              }}>
                <Trash size={14} aria-hidden />
              </Button>
            </div>
            {editing === m.id && (
              <CrewMemberForm member={m} onSave={(body) => saveMember(m.id, body).catch(() => toast.error(t('tour_planner_error')))} />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MerchPanel({ artistId }: { artistId: string }) {
  const t = useTranslations('portal')
  const qc = useQueryClient()
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [basePrice, setBasePrice] = useState(0)
  const [category, setCategory] = useState<'soft' | 'hard'>('soft')
  const [variantValue, setVariantValue] = useState('')
  const [variantDrafts, setVariantDrafts] = useState<Record<string, string>>({})
  const { data: items = [] } = useTourPlannerMerch(artistId)

  const invalidate = () => void qc.invalidateQueries({ queryKey: tourPlannerKeys.merch(artistId) })

  const create = useMutation({
    mutationFn: async () => {
      const variants: MerchVariant[] = variantValue
        ? [{ id: crypto.randomUUID(), type: 'size', value: variantValue, stock: 0 }]
        : []
      const res = await tourPlannerFetch(artistId, '/merch', {
        method: 'POST',
        body: JSON.stringify({ sku, name, basePrice, category, variants }),
      })
      if (!res.ok) throw new Error('merch create')
      return wasQueuedOffline(res)
    },
    onSuccess: (offline) => {
      invalidate()
      setSku('')
      setName('')
      setBasePrice(0)
      setVariantValue('')
      if (offline) toast.success(t('tour_planner_saved_offline'))
      else toast.success(t('tour_planner_merch_added'))
    },
  })

  const addVariant = async (item: TourMerchItem, value: string) => {
    if (!value) return
    const variants = [...item.variants, { id: crypto.randomUUID(), type: 'size' as const, value, stock: 0 }]
    const res = await tourPlannerFetch(artistId, `/merch/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ variants }),
    })
    if (!res.ok) { toast.error(t('tour_planner_error')); return }
    invalidate()
  }

  const deleteItem = async (itemId: string) => {
    const res = await tourPlannerFetch(artistId, `/merch/${itemId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(t('tour_planner_error')); return }
    invalidate()
    toast.success(t('tour_planner_merch_deleted'))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input placeholder={t('tour_planner_merch_sku')} value={sku} onChange={(e) => setSku(e.target.value)} />
        <Input placeholder={t('tour_planner_merch_name')} value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="number" placeholder={t('tour_planner_merch_price')} value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} aria-label={t('tour_planner_merch_price')} />
        <Select value={category} onValueChange={(v) => setCategory(v as 'soft' | 'hard')}>
          <SelectTrigger className="w-[140px]" aria-label={t('tour_planner_merch_category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="soft">{t('tour_planner_merch_soft')}</SelectItem>
            <SelectItem value="hard">{t('tour_planner_merch_hard')}</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder={t('tour_planner_variant')} value={variantValue} onChange={(e) => setVariantValue(e.target.value)} />
        <Button disabled={!sku || !name} onClick={() => create.mutate()}>{t('tour_planner_add_merch')}</Button>
      </div>
      <ul className="divide-y divide-border rounded-md border">
        {items.map((item) => (
          <li key={item.id} className="p-3 text-sm space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span>{item.sku} — {item.name} · {item.basePrice} {item.currency} ({item.category})</span>
              <Button variant="ghost" size="sm" aria-label={t('tour_planner_delete_merch')} onClick={() => deleteItem(item.id)}>
                <Trash size={14} aria-hidden />
              </Button>
            </div>
            {item.variants.length > 0 && (
              <p className="text-muted-foreground">{t('tour_planner_variants')}: {item.variants.map((v) => v.value).join(', ')}</p>
            )}
            <div className="flex gap-2">
              <Input
                placeholder={t('tour_planner_variant')}
                id={`variant-${item.id}`}
                value={variantDrafts[item.id] ?? ''}
                onChange={(e) => setVariantDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = variantDrafts[item.id] ?? ''
                    addVariant(item, value).then(() => setVariantDrafts((prev) => ({ ...prev, [item.id]: '' })))
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const value = variantDrafts[item.id] ?? ''
                  addVariant(item, value).then(() => setVariantDrafts((prev) => ({ ...prev, [item.id]: '' })))
                }}
              >
                {t('tour_planner_add_variant')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function emptyMerchSettlement(stop: TourStop): MerchSettlement {
  return {
    showId: stop.id,
    date: stop.stopDate,
    countIn: {},
    adds: {},
    comps: [],
    countOut: {},
    sold: {},
    grossRevenue: 0,
    hallFee: 0,
    hallFeePercentageSoft: 15,
    hallFeePercentageHard: 25,
    netRevenue: 0,
    taxRate: 0,
    notes: '',
  }
}

export function MerchSettlementForm({
  artistId,
  stop,
  onSaved,
}: {
  artistId: string
  stop: TourStop
  onSaved: () => void
}) {
  const t = useTranslations('portal')
  const { offline } = useOnlineStatus()
  const pdfLabels = buildTourPlannerPdfLabels(t)
  const [draft, setDraft] = useState<MerchSettlement>(emptyMerchSettlement(stop))
  const [loading, setLoading] = useState(true)
  const [compVariant, setCompVariant] = useState('')
  const [compQty, setCompQty] = useState(1)
  const [compReason, setCompReason] = useState('')

  useEffect(() => {
    if (offline) {
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await tourPlannerFetch(artistId, `/merch/settlement?stopId=${stop.id}`)
        if (!res.ok) return
        const json = (await res.json()) as { record: { settlement: MerchSettlement } | null }
        if (!cancelled && json.record?.settlement) setDraft(json.record.settlement)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [artistId, stop.id, offline])

  const save = async () => {
    const res = await tourPlannerFetch(artistId, '/merch/settlement', {
      method: 'POST',
      body: JSON.stringify({ stopId: stop.id, settlement: draft }),
    })
    if (!res.ok) {
      toast.error(t('tour_planner_error'))
      return
    }
    if (wasQueuedOffline(res)) toast.success(t('tour_planner_saved_offline'))
    else toast.success(t('tour_planner_saved'))
    onSaved()
  }

  const { data: merchItems = [] } = useTourPlannerMerch(artistId)

  const variantRows = merchItems.flatMap((item) => {
    if (item.variants.length === 0) {
      return [{ key: item.id, label: item.name, price: item.basePrice }]
    }
    return item.variants.map((v) => ({
      key: v.id,
      label: `${item.name} (${v.value})`,
      price: item.basePrice,
    }))
  })

  const setQty = (field: 'countIn' | 'countOut' | 'sold', key: string, value: number) => {
    const next = { ...draft, [field]: { ...draft[field], [key]: value } }
    if (field === 'sold') {
      const gross = variantRows.reduce((sum, row) => sum + (next.sold[row.key] ?? 0) * row.price, 0)
      next.grossRevenue = gross
      const hallPct = merchItems.some((i) => i.category === 'hard')
        ? next.hallFeePercentageHard
        : next.hallFeePercentageSoft
      next.hallFee = gross * (hallPct / 100)
      next.netRevenue = gross - next.hallFee
    }
    setDraft(next)
  }

  const addComp = () => {
    if (!compVariant || !compQty) return
    const comp: MerchComp = { itemVariantId: compVariant, quantity: compQty, reason: compReason, recipientName: '' }
    setDraft({ ...draft, comps: [...draft.comps, comp] })
    setCompReason('')
    setCompQty(1)
  }

  const variantLabel = (key: string) => variantRows.find((row) => row.key === key)?.label ?? key

  const num = (key: 'hallFee' | 'netRevenue' | 'taxRate', value: string) => {
    setDraft({ ...draft, [key]: Number(value) })
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {variantRows.length > 0 && (
        <div className="sm:col-span-2 space-y-2">
          <p className="text-sm font-medium">{t('tour_planner_merch_inventory')}</p>
          {variantRows.map((row) => (
            <div key={row.key} className="grid gap-2 sm:grid-cols-4 items-end border-b border-border pb-2">
              <span className="text-sm sm:col-span-1">{row.label}</span>
              <div className="space-y-1">
                <Label>{t('tour_planner_count_in')}</Label>
                <Input type="number" value={draft.countIn[row.key] ?? 0} onChange={(e) => setQty('countIn', row.key, Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>{t('tour_planner_count_out')}</Label>
                <Input type="number" value={draft.countOut[row.key] ?? 0} onChange={(e) => setQty('countOut', row.key, Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>{t('tour_planner_sold')}</Label>
                <Input type="number" value={draft.sold[row.key] ?? 0} onChange={(e) => setQty('sold', row.key, Number(e.target.value))} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">
        <Label>{t('tour_planner_merch_gross')}</Label>
        <Input type="number" value={draft.grossRevenue} readOnly />
      </div>
      <div className="space-y-1">
        <Label>{t('tour_planner_merch_hall_fee')}</Label>
        <Input type="number" value={draft.hallFee} onChange={(e) => num('hallFee', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>{t('tour_planner_merch_net')}</Label>
        <Input type="number" value={draft.netRevenue} onChange={(e) => num('netRevenue', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>{t('tour_planner_tax_rate')}</Label>
        <Input type="number" value={draft.taxRate} onChange={(e) => num('taxRate', e.target.value)} />
      </div>
      {variantRows.length > 0 && (
        <div className="sm:col-span-2 flex flex-wrap gap-2 items-end">
          <Select
            value={compVariant || variantRows[0]?.key}
            onValueChange={setCompVariant}
          >
            <SelectTrigger className="min-w-[160px]" aria-label={t('tour_planner_comp_variant')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variantRows.map((row) => <SelectItem key={row.key} value={row.key}>{row.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" min={1} value={compQty} onChange={(e) => setCompQty(Number(e.target.value))} aria-label={t('tour_planner_comp_qty')} className="w-24" />
          <Input placeholder={t('tour_planner_comp_reason')} value={compReason} onChange={(e) => setCompReason(e.target.value)} className="flex-1 min-w-[120px]" />
          <Button variant="outline" onClick={addComp}>{t('tour_planner_add_comp')}</Button>
        </div>
      )}
      {draft.comps.length > 0 && (
        <ul className="sm:col-span-2 text-sm space-y-1">
          {draft.comps.map((c, i) => (
            <li key={`${c.itemVariantId}-${i}`}>{c.quantity}× {variantLabel(c.itemVariantId)}{c.reason ? ` — ${c.reason}` : ''}</li>
          ))}
        </ul>
      )}
      <div className="space-y-1 sm:col-span-2">
        <Label>{t('tour_planner_notes')}</Label>
        <Textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </div>
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={loading}>{t('tour_planner_save')}</Button>
        <Button variant="outline" disabled={loading} onClick={() => downloadMerchSettlementPdf(stop, draft, pdfLabels)}>
          {t('tour_planner_pdf')}
        </Button>
      </div>
    </div>
  )
}

export function HotelForm({
  stop,
  onSave,
}: {
  stop: TourStop
  onSave: (fields: Pick<TourStop, 'hotelName' | 'hotelAddress' | 'hotelCity' | 'hotelCountry' | 'isTravelDay'>) => void
}) {
  const t = useTranslations('portal')
  const [hotelName, setHotelName] = useState(stop.hotelName ?? '')
  const [hotelAddress, setHotelAddress] = useState(stop.hotelAddress ?? '')
  const [hotelCity, setHotelCity] = useState(stop.hotelCity ?? '')
  const [hotelCountry, setHotelCountry] = useState(stop.hotelCountry ?? '')
  const [isTravelDay, setIsTravelDay] = useState(stop.isTravelDay)

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={isTravelDay} onChange={(e) => setIsTravelDay(e.target.checked)} />
        {t('tour_planner_travel_day_label')}
      </label>
      <div className="space-y-1">
        <Label htmlFor="hotel-name">{t('tour_planner_hotel_name')}</Label>
        <Input id="hotel-name" value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="hotel-city">{t('tour_planner_hotel_city')}</Label>
        <Input id="hotel-city" value={hotelCity} onChange={(e) => setHotelCity(e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="hotel-address">{t('tour_planner_hotel_address')}</Label>
        <Input id="hotel-address" value={hotelAddress} onChange={(e) => setHotelAddress(e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="hotel-country">{t('tour_planner_hotel_country')}</Label>
        <Input id="hotel-country" value={hotelCountry} onChange={(e) => setHotelCountry(e.target.value)} />
      </div>
      <Button
        className="sm:col-span-2"
        onClick={() => onSave({
          hotelName: hotelName || null,
          hotelAddress: hotelAddress || null,
          hotelCity: hotelCity || null,
          hotelCountry: hotelCountry || null,
          isTravelDay,
        })}
      >
        {t('tour_planner_save')}
      </Button>
    </div>
  )
}

export function ImportPanel({
  artistId,
  tourId,
  concerts,
  stops,
  onImported,
}: {
  artistId: string
  tourId: string | null
  concerts: Concert[]
  stops: TourStop[]
  onImported: () => void
}) {
  const t = useTranslations('portal')
  const ref = useRef<HTMLInputElement>(null)
  const importCsv = useMutation({
    mutationFn: async (csv: string) => {
      if (!tourId) throw new Error('no tour')
      const res = await tourPlannerFetch(artistId, '/import', { method: 'POST', body: JSON.stringify({ tourId, csv }) })
      if (!res.ok) throw new Error('import')
      return wasQueuedOffline(res)
    },
    onSuccess: (offline) => {
      onImported()
      toast.success(offline ? t('tour_planner_saved_offline') : t('tour_planner_import_csv_done'))
    },
    onError: () => toast.error(t('tour_planner_error')),
  })

  const importConcert = useMutation({
    mutationFn: async (concertId: string) => {
      if (!tourId) throw new Error('no tour')
      const res = await tourPlannerFetch(artistId, '/stops/import-concert', {
        method: 'POST',
        body: JSON.stringify({ tourId, concertId }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(err?.error ?? 'Import failed')
      }
      return wasQueuedOffline(res)
    },
    onSuccess: (offline) => {
      onImported()
      toast.success(offline ? t('tour_planner_saved_offline') : t('tour_planner_import_success'))
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!tourId) return <p className="text-sm text-muted-foreground">{t('tour_planner_select_tour_first')}</p>

  const importableConcerts = concerts.filter(
    (concert) => !stops.some((stop) => stop.concertId === concert.id),
  )

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-semibold">{t('tour_planner_import_csv_heading')}</h3>
        <p className="text-sm text-muted-foreground">{t('tour_planner_import_csv_desc')}</p>
        <input ref={ref} type="file" accept=".csv,.txt" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          importCsv.mutate(await file.text())
          e.target.value = ''
        }} />
        <Button variant="outline" onClick={() => ref.current?.click()} disabled={importCsv.isPending}>{t('tour_planner_import_csv')}</Button>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <h3 className="font-semibold">{t('tour_planner_import_heading')}</h3>
        <p className="text-sm text-muted-foreground">{t('tour_planner_import_desc')}</p>
        {importableConcerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tour_planner_import_none')}</p>
        ) : (
          <ul className="space-y-2">
            {importableConcerts.map((concert) => (
              <li key={concert.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <p className="font-medium">{concert.eventName}</p>
                  <p className="text-sm text-muted-foreground">
                    {concert.concertDate}
                    {concert.venueCity ? ` · ${concert.venueCity}` : ''}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => importConcert.mutate(concert.id)}
                  disabled={importConcert.isPending}
                >
                  {t('tour_planner_import_button')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function GuestListForm({ list, onSave }: { list: GuestListEntry[]; onSave: (l: GuestListEntry[]) => void }) {
  const t = useTranslations('portal')
  const [draft, setDraft] = useState<GuestListEntry[]>(list)
  const [name, setName] = useState('')
  const [guests, setGuests] = useState(1)

  const add = () => {
    if (!name) return
    setDraft([...draft, { id: crypto.randomUUID(), name, showId: '', numberOfGuests: guests }])
    setName('')
    setGuests(1)
  }

  return (
    <div className="space-y-3">
      <ul className="text-sm space-y-2 divide-y divide-border">
        {draft.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-2 pt-2">
            <span>{g.name} ({g.numberOfGuests})</span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('tour_planner_remove')}
              onClick={() => setDraft(draft.filter((x) => x.id !== g.id))}
            >
              <Trash size={14} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input placeholder={t('tour_planner_guest_name')} value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="number" min={1} value={guests} onChange={(e) => setGuests(Number(e.target.value))} aria-label={t('tour_planner_guest_count')} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={add}>{t('tour_planner_add_guest')}</Button>
        <Button onClick={() => onSave(draft)}>{t('tour_planner_save')}</Button>
      </div>
    </div>
  )
}

const VENUE_CONTACT_FIELDS = [
  'promoterName', 'promoterEmail', 'promoterPhone', 'venueContactName', 'technicalContactName',
] as const satisfies readonly (keyof VenueContactInfo)[]

const LOADIN_FIELDS = [
  'loadingDock', 'powerSupply', 'paSpecs', 'capacity', 'loadInNotes', 'parkingSpaces',
] as const satisfies readonly (keyof VenueDetails)[]

const SETTLEMENT_FIELDS = ['ticketsSold', 'ticketPrice', 'grossRevenue', 'venueCosts', 'netRevenue', 'artistPayment'] as const

const VENUE_CONTACT_I18N: Record<(typeof VENUE_CONTACT_FIELDS)[number], 'tour_planner_venue_promoterName' | 'tour_planner_venue_promoterEmail' | 'tour_planner_venue_promoterPhone' | 'tour_planner_venue_venueContactName' | 'tour_planner_venue_technicalContactName'> = {
  promoterName: 'tour_planner_venue_promoterName',
  promoterEmail: 'tour_planner_venue_promoterEmail',
  promoterPhone: 'tour_planner_venue_promoterPhone',
  venueContactName: 'tour_planner_venue_venueContactName',
  technicalContactName: 'tour_planner_venue_technicalContactName',
}

const LOADIN_I18N: Record<(typeof LOADIN_FIELDS)[number], 'tour_planner_loadin_loadingDock' | 'tour_planner_loadin_powerSupply' | 'tour_planner_loadin_paSpecs' | 'tour_planner_loadin_capacity' | 'tour_planner_loadin_loadInNotes' | 'tour_planner_loadin_parkingSpaces'> = {
  loadingDock: 'tour_planner_loadin_loadingDock',
  powerSupply: 'tour_planner_loadin_powerSupply',
  paSpecs: 'tour_planner_loadin_paSpecs',
  capacity: 'tour_planner_loadin_capacity',
  loadInNotes: 'tour_planner_loadin_loadInNotes',
  parkingSpaces: 'tour_planner_loadin_parkingSpaces',
}

const SETTLEMENT_I18N: Record<(typeof SETTLEMENT_FIELDS)[number], 'tour_planner_settlement_ticketsSold' | 'tour_planner_settlement_ticketPrice' | 'tour_planner_settlement_grossRevenue' | 'tour_planner_settlement_venueCosts' | 'tour_planner_settlement_netRevenue' | 'tour_planner_settlement_artistPayment'> = {
  ticketsSold: 'tour_planner_settlement_ticketsSold',
  ticketPrice: 'tour_planner_settlement_ticketPrice',
  grossRevenue: 'tour_planner_settlement_grossRevenue',
  venueCosts: 'tour_planner_settlement_venueCosts',
  netRevenue: 'tour_planner_settlement_netRevenue',
  artistPayment: 'tour_planner_settlement_artistPayment',
}

export function VenueContactForm({ info, onSave }: { info: VenueContactInfo | null; onSave: (v: VenueContactInfo) => void }) {
  const t = useTranslations('portal')
  const [draft, setDraft] = useState<VenueContactInfo>(info ?? {})
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {VENUE_CONTACT_FIELDS.map((field) => (
        <div key={field} className="space-y-1">
          <Label htmlFor={field}>{t(VENUE_CONTACT_I18N[field])}</Label>
          <Input id={field} value={draft[field] ?? ''} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />
        </div>
      ))}
      <div className="sm:col-span-2 space-y-1">
        <Label>{t('tour_planner_notes')}</Label>
        <Textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </div>
      <Button className="sm:col-span-2" onClick={() => onSave(draft)}>{t('tour_planner_save')}</Button>
    </div>
  )
}

export function LoadInForm({ details, onSave }: { details: VenueDetails | null; onSave: (v: VenueDetails) => void }) {
  const t = useTranslations('portal')
  const [draft, setDraft] = useState<VenueDetails>(details ?? {})
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {LOADIN_FIELDS.map((field) => (
        <div key={field} className="space-y-1">
          <Label htmlFor={String(field)}>{t(LOADIN_I18N[field])}</Label>
          <Input
            id={String(field)}
            value={String(draft[field] ?? '')}
            onChange={(e) => setDraft({
              ...draft,
              [field]: field === 'capacity' || field === 'parkingSpaces' ? Number(e.target.value) : e.target.value,
            })}
          />
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={draft.truckAccess ?? false} onChange={(e) => setDraft({ ...draft, truckAccess: e.target.checked })} />
        {t('tour_planner_loadin_truck_access')}
      </label>
      <Button className="sm:col-span-2" onClick={() => onSave(draft)}>{t('tour_planner_save')}</Button>
    </div>
  )
}

export function SettlementForm({
  stop,
  settlement,
  deal,
  onSave,
}: {
  stop: TourStop
  settlement: Settlement | null
  deal: DealStructure | null
  onSave: (s: Settlement) => void
}) {
  const t = useTranslations('portal')
  const pdfLabels = buildTourPlannerPdfLabels(t)
  const [draft, setDraft] = useState<Settlement>(settlement ?? {
    ticketsSold: 0, ticketPrice: 0, grossRevenue: 0, venueCosts: 0, netRevenue: 0, artistPayment: 0,
  })
  const num = (k: keyof Settlement, v: string) => setDraft({ ...draft, [k]: Number(v) })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SETTLEMENT_FIELDS.map((field) => (
        <div key={field} className="space-y-1">
          <Label htmlFor={field}>{t(SETTLEMENT_I18N[field])}</Label>
          <Input id={field} type="number" value={draft[field]} onChange={(e) => num(field, e.target.value)} />
        </div>
      ))}
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <Button onClick={() => onSave(draft)}>{t('tour_planner_save')}</Button>
        <Button variant="outline" onClick={() => downloadSettlementPdf(stop, draft, deal, pdfLabels)}>
          {t('tour_planner_pdf')}
        </Button>
      </div>
    </div>
  )
}

export function CoHeadlineForm({
  rosterArtists,
  performingArtistIds,
  externalGuestNotes,
  onSave,
}: {
  rosterArtists: { artistId: string; artistName: string }[]
  performingArtistIds: string[]
  externalGuestNotes: string | null
  onSave: (data: { performingArtistIds?: string[]; externalGuestNotes?: string | null }) => void
}) {
  const t = useTranslations('portal')
  const [selected, setSelected] = useState<string[]>(performingArtistIds)
  const [guestNotes, setGuestNotes] = useState(externalGuestNotes ?? '')

  useEffect(() => {
    setSelected(performingArtistIds)
    setGuestNotes(externalGuestNotes ?? '')
  }, [performingArtistIds, externalGuestNotes])

  const toggleArtist = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-3">
      {rosterArtists.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('tour_planner_co_headline')}</p>
          <ul className="flex flex-wrap gap-2" role="list">
            {rosterArtists.map((artist) => {
              const checked = selected.includes(artist.artistId)
              return (
                <li key={artist.artistId}>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border"
                      checked={checked}
                      onChange={() => toggleArtist(artist.artistId)}
                    />
                    {artist.artistName}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="external-guest-notes">{t('tour_planner_external_guests')}</Label>
        <Textarea
          id="external-guest-notes"
          value={guestNotes}
          onChange={(e) => setGuestNotes(e.target.value)}
          placeholder={t('tour_planner_external_guests_placeholder')}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">{t('tour_planner_external_guests_hint')}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onSave({
          ...(rosterArtists.length > 1 ? { performingArtistIds: selected } : {}),
          externalGuestNotes: guestNotes.trim() || null,
        })}
      >
        {t('tour_planner_save_lineup')}
      </Button>
    </div>
  )
}

function CollaboratorsSection({
  artistId,
  tour,
  onUpdated,
}: {
  artistId: string
  tour: Tour
  onUpdated: () => void
}) {
  const t = useTranslations('portal')
  const { offline } = useOnlineStatus()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; slug: string | null }[]>([])
  const [searching, setSearching] = useState(false)

  const search = async () => {
    if (query.trim().length < 2 || offline) return
    setSearching(true)
    try {
      const res = await tourPlannerFetch(artistId, `/artists/search?q=${encodeURIComponent(query.trim())}`)
      if (!res.ok) throw new Error('search failed')
      const json = await res.json() as { artists: { id: string; name: string; slug: string | null }[] }
      setResults(json.artists)
    } catch {
      toast.error(t('tour_planner_error'))
    } finally {
      setSearching(false)
    }
  }

  const addCollaborator = async (collaboratorArtistId: string) => {
    const res = await tourPlannerFetch(artistId, `/tours/${tour.id}/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ collaboratorArtistId }),
    })
    if (!res.ok) { toast.error(t('tour_planner_error')); return }
    setQuery('')
    setResults([])
    onUpdated()
    toast.success(t('tour_planner_collaborator_added'))
  }

  const removeCollaborator = async (collaboratorArtistId: string) => {
    const res = await tourPlannerFetch(
      artistId,
      `/tours/${tour.id}/collaborators?collaboratorArtistId=${encodeURIComponent(collaboratorArtistId)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) { toast.error(t('tour_planner_error')); return }
    onUpdated()
    toast.success(t('tour_planner_collaborator_removed'))
  }

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <h3 className="font-semibold">{t('tour_planner_collaborators')}</h3>
      <p className="text-sm text-muted-foreground">{t('tour_planner_collaborators_desc')}</p>
      {(tour.collaborators ?? []).length > 0 ? (
        <ul className="space-y-2" role="list">
          {(tour.collaborators ?? []).map((c) => (
            <li key={c.artistId} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <span>{c.artistName}</span>
              <Button variant="ghost" size="sm" onClick={() => void removeCollaborator(c.artistId)}>
                <Trash size={14} aria-hidden />
                {t('tour_planner_remove_collaborator')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('tour_planner_no_collaborators')}</p>
      )}
      <div className="flex flex-wrap gap-2 max-w-xl">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('tour_planner_search_roster')}
          aria-label={t('tour_planner_search_roster')}
          disabled={offline}
        />
        <Button variant="outline" onClick={() => void search()} disabled={offline || searching || query.trim().length < 2}>
          {t('tour_planner_search')}
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="space-y-1 max-w-xl" role="list">
          {results.map((a) => (
            <li key={a.id}>
              <Button variant="ghost" className="w-full justify-start" onClick={() => void addCollaborator(a.id)}>
                {a.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function SettingsPanel({
  artistId,
  tour,
  onSaved,
  onDeleted,
}: {
  artistId: string
  tour: Tour | null
  onSaved: () => void
  onDeleted: () => void
}) {
  const t = useTranslations('portal')
  const qc = useQueryClient()
  const [draft, setDraft] = useState<TourPlannerSettings | null>(tour?.settings ?? null)
  const [totalBudget, setTotalBudget] = useState<number | null>(tour?.totalBudget ?? null)
  const [currency, setCurrency] = useState(tour?.currency ?? 'EUR')
  const [budget, setBudget] = useState<TourBudget | null>(tour?.budget ?? null)
  const [techDocuments, setTechDocuments] = useState(tour?.techDocuments ?? [])
  useEffect(() => {
    if (tour) {
      setDraft(tour.settings)
      setTotalBudget(tour.totalBudget)
      setCurrency(tour.currency)
      setBudget(tour.budget ?? EMPTY_TOUR_BUDGET)
      setTechDocuments(tour.techDocuments)
    }
  }, [tour])
  if (!tour || !draft) return null
  const isOwner = tour.accessRole !== 'collaborator'

  const patchTour = async (body: Record<string, unknown>) => {
    const res = await tourPlannerFetch(artistId, `/tours/${tour.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    if (!res.ok) { toast.error(t('tour_planner_error')); return false }
    onSaved()
    toast.success(wasQueuedOffline(res) ? t('tour_planner_saved_offline') : t('tour_planner_saved'))
    return true
  }

  const saveSettings = async () => {
    await patchTour({ settings: draft, totalBudget, currency })
  }

  const toggleArchive = async () => {
    const res = await tourPlannerFetch(artistId, `/tours/${tour.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: !tour.archived }),
    })
    if (!res.ok) { toast.error(t('tour_planner_error')); return }
    onSaved()
    toast.success(tour.archived ? t('tour_planner_tour_restored') : t('tour_planner_tour_archived'))
  }

  const duplicateTour = async () => {
    const res = await tourPlannerFetch(artistId, `/tours/${tour.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ duplicate: true }),
    })
    if (!res.ok) { toast.error(t('tour_planner_error')); return }
    void qc.invalidateQueries({ queryKey: tourPlannerKeys.tours(artistId) })
    toast.success(t('tour_planner_tour_duplicated'))
  }

  const deleteTour = async () => {
    if (!window.confirm(t('tour_planner_delete_confirm'))) return
    const res = await tourPlannerFetch(artistId, `/tours/${tour.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error(t('tour_planner_error')); return }
    onDeleted()
  }

  return (
    <div className="space-y-8">
      {isOwner && <CollaboratorsSection artistId={artistId} tour={tour} onUpdated={onSaved} />}
      {!isOwner && tour.ownerArtistName && (
        <p className="text-sm text-muted-foreground rounded-lg border border-border p-4">
          {t('tour_planner_collaborator_view', { owner: tour.ownerArtistName })}
        </p>
      )}
      <section className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="font-semibold">{t('tour_planner_settings_route')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
          <div className="space-y-1">
            <Label>{t('tour_planner_vehicle')}</Label>
            <Select value={draft.vehicleType} onValueChange={(v) => setDraft({ ...draft, vehicleType: v as VehicleType })}>
              <SelectTrigger aria-label={t('tour_planner_vehicle')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="car">{t('tour_planner_vehicle_car')}</SelectItem>
                <SelectItem value="bus">{t('tour_planner_vehicle_bus')}</SelectItem>
                <SelectItem value="truck">{t('tour_planner_vehicle_truck')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('tour_planner_planning_mode')}</Label>
            <Select value={draft.planningMode} onValueChange={(v) => setDraft({ ...draft, planningMode: v as PlanningMode })}>
              <SelectTrigger aria-label={t('tour_planner_planning_mode')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fastest">{t('tour_planner_planning_fastest')}</SelectItem>
                <SelectItem value="avoid-rush-hour">{t('tour_planner_planning_avoid_rush')}</SelectItem>
                <SelectItem value="balanced">{t('tour_planner_planning_balanced')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('tour_planner_api_provider')}</Label>
            <Select value={draft.apiProvider} onValueChange={(v) => setDraft({ ...draft, apiProvider: v as TourPlannerSettings['apiProvider'] })}>
              <SelectTrigger aria-label={t('tour_planner_api_provider')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nominatim">Nominatim</SelectItem>
                <SelectItem value="google">Google</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.apiProvider === 'google' && (
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="google-api-key">{t('tour_planner_google_api_key')}</Label>
              <Input
                id="google-api-key"
                type="password"
                value={draft.googleApiKey ?? ''}
                onChange={(e) => setDraft({ ...draft, googleApiKey: e.target.value || undefined })}
                autoComplete="off"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="fuel-cost">{t('tour_planner_fuel_cost')}</Label>
            <Input
              id="fuel-cost"
              type="number"
              step="0.01"
              value={draft.fuelCostPerKm ?? ''}
              onChange={(e) => setDraft({ ...draft, fuelCostPerKm: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="toll-costs">{t('tour_planner_toll_costs')}</Label>
            <Input
              id="toll-costs"
              type="number"
              value={draft.tollCosts ?? ''}
              onChange={(e) => setDraft({ ...draft, tollCosts: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        </div>
        <Button onClick={() => void saveSettings()}>{t('tour_planner_save')}</Button>
      </section>

      <section className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="font-semibold">{t('tour_planner_settings_budget')}</h3>
        <BudgetForm
          budget={budget}
          currency={currency}
          totalBudget={totalBudget}
          onSave={(data) => {
            setBudget(data.budget)
            setTotalBudget(data.totalBudget)
            setCurrency(data.currency)
            void patchTour({ budget: data.budget, totalBudget: data.totalBudget, currency: data.currency })
          }}
        />
      </section>

      <section className="space-y-4 rounded-lg border border-border p-4">
        <h3 className="font-semibold">{t('tour_planner_settings_tech_docs')}</h3>
        <TechDocumentsForm
          artistId={artistId}
          tourId={tour.id}
          documents={techDocuments}
          onSave={(docs) => {
            setTechDocuments(docs)
            void patchTour({ techDocuments: docs })
          }}
        />
      </section>

      {isOwner && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => void toggleArchive()}>
            {tour.archived ? t('tour_planner_unarchive_tour') : t('tour_planner_archive_tour')}
          </Button>
          <Button variant="outline" onClick={() => void duplicateTour()}>{t('tour_planner_duplicate_tour')}</Button>
          <Button variant="destructive" onClick={() => void deleteTour()}>{t('tour_planner_delete_tour')}</Button>
        </div>
      )}
    </div>
  )
}

async function geocodeQuery(
  artistId: string,
  query: string,
  tourId: string,
): Promise<GeocodeResult> {
  const res = await tourPlannerFetch(artistId, '/geocode', {
    method: 'POST',
    body: JSON.stringify({ query, tourId }),
  })
  if (wasQueuedOffline(res)) return { status: 'queued' }
  if (!res.ok) return { status: 'fail' }
  const json = (await res.json()) as { coords?: { lat: number; lon: number } }
  return json.coords
    ? { status: 'ok', lat: json.coords.lat, lng: json.coords.lon }
    : { status: 'fail' }
}

export async function geocodeStopVenue(
  artistId: string,
  tourId: string,
  stop: TourStop,
): Promise<GeocodeResult> {
  const q = [stop.venueAddress, stop.venueCity, stop.venueCountry].filter(Boolean).join(', ')
  if (!q) return { status: 'fail' }
  return geocodeQuery(artistId, q, tourId)
}

export async function geocodeStopHotel(
  artistId: string,
  tourId: string,
  stop: TourStop,
): Promise<GeocodeResult> {
  const q = [stop.hotelAddress, stop.hotelCity, stop.hotelCountry].filter(Boolean).join(', ')
  if (!q) return { status: 'fail' }
  return geocodeQuery(artistId, q, tourId)
}