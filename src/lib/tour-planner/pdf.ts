import { jsPDF } from 'jspdf'
import type { Tour, TourStop } from '@/types'
import type { DaySchedule, DealStructure, MerchSettlement, Settlement } from '@/lib/tour-planner/types'

export interface TourPlannerPdfLabels {
  daySheet: string
  schedule: string
  venue: string
  date: string
  show: string
  tbd: string
  getIn: string
  soundcheck: string
  doors: string
  stageTime: string
  curfew: string
  settlement: string
  ticketsSold: string
  ticketPrice: string
  grossRevenue: string
  venueCosts: string
  netRevenue: string
  artistPayment: string
  notes: string
  merchSettlement: string
  hallFee: string
  itemsSold: string
  signedAt: string
  signature: string
  itinerary?: string
  status?: string
  hotel?: string
  travelDay?: string
  deal?: string
}

function formatMoney(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
}

function writeLines(doc: jsPDF, lines: string[], startY = 16): void {
  doc.setFontSize(11)
  lines.forEach((line, i) => doc.text(line, 14, startY + i * 7))
}

export function downloadDaySheetPdf(
  stop: TourStop,
  schedule: DaySchedule,
  labels: TourPlannerPdfLabels,
): void {
  const doc = new jsPDF()
  const s = schedule
  const lines = [
    `${labels.daySheet} — ${stop.venueName ?? labels.show}`,
    `${labels.date}: ${stop.stopDate}`,
    '',
    labels.schedule,
    `${labels.getIn}: ${s.getIn ?? labels.tbd}`,
    `${labels.soundcheck}: ${s.soundcheck ?? labels.tbd}`,
    `${labels.doors}: ${s.doors ?? labels.tbd}`,
    `${labels.stageTime}: ${s.stageTime ?? labels.tbd}`,
    `${labels.curfew}: ${s.curfew ?? labels.tbd}`,
    '',
    labels.venue,
    stop.venueAddress ?? '',
    `${stop.venueCity ?? ''}, ${stop.venueCountry ?? ''}`,
  ]
  writeLines(doc, lines)
  doc.save(`day-sheet-${stop.stopDate}.pdf`)
}

export function downloadSettlementPdf(
  stop: TourStop,
  settlement: Settlement,
  deal: DealStructure | null,
  labels: TourPlannerPdfLabels,
): void {
  const doc = new jsPDF()
  const currency = deal?.currency ?? 'EUR'
  const lines = [
    `${labels.settlement} — ${stop.venueName ?? labels.show}`,
    `${labels.date}: ${stop.stopDate}`,
    '',
    `${labels.ticketsSold}: ${settlement.ticketsSold}`,
    `${labels.ticketPrice}: ${formatMoney(settlement.ticketPrice, currency)}`,
    `${labels.grossRevenue}: ${formatMoney(settlement.grossRevenue, currency)}`,
    `${labels.venueCosts}: ${formatMoney(settlement.venueCosts, currency)}`,
    `${labels.netRevenue}: ${formatMoney(settlement.netRevenue, currency)}`,
    `${labels.artistPayment}: ${formatMoney(settlement.artistPayment, currency)}`,
  ]
  if (settlement.notes) lines.push('', `${labels.notes}:`, settlement.notes)
  if (settlement.venueRepSignature) {
    lines.push('', `${labels.signature}: ${settlement.venueRepSignature}`)
  }
  if (settlement.signedAt) lines.push(`${labels.signedAt}: ${settlement.signedAt}`)
  writeLines(doc, lines)
  doc.save(`settlement-${stop.stopDate}.pdf`)
}

export function downloadMerchSettlementPdf(
  stop: TourStop,
  settlement: MerchSettlement,
  labels: TourPlannerPdfLabels,
): void {
  const doc = new jsPDF()
  const soldTotal = Object.values(settlement.sold).reduce((sum, qty) => sum + qty, 0)
  const lines = [
    `${labels.merchSettlement} — ${stop.venueName ?? labels.show}`,
    `${labels.date}: ${stop.stopDate}`,
    '',
    `${labels.grossRevenue}: ${formatMoney(settlement.grossRevenue)}`,
    `${labels.hallFee}: ${formatMoney(settlement.hallFee)}`,
    `${labels.netRevenue}: ${formatMoney(settlement.netRevenue)}`,
    `${labels.itemsSold}: ${soldTotal}`,
  ]
  if (settlement.notes) lines.push('', `${labels.notes}:`, settlement.notes)
  if (settlement.venueRepSignature) {
    lines.push('', `${labels.signature}: ${settlement.venueRepSignature}`)
  }
  if (settlement.signedAt) lines.push(`${labels.signedAt}: ${settlement.signedAt}`)
  writeLines(doc, lines)
  doc.save(`merch-settlement-${stop.stopDate}.pdf`)
}

function dealSummary(deal: DealStructure | null, labels: TourPlannerPdfLabels): string {
  if (!deal) return labels.tbd
  const parts: string[] = [String(deal.type)]
  if (deal.guarantee != null) parts.push(formatMoney(deal.guarantee, deal.currency))
  if (deal.doorSplitPercentage != null) parts.push(`${deal.doorSplitPercentage}%`)
  return parts.join(' · ')
}

/** Full tour itinerary (all stops chronological). */
export function downloadTourItineraryPdf(
  tour: Tour,
  stops: TourStop[],
  labels: TourPlannerPdfLabels,
): void {
  const doc = new jsPDF()
  const sorted = [...stops].sort((a, b) => {
    const d = a.stopDate.localeCompare(b.stopDate)
    return d !== 0 ? d : a.sortOrder - b.sortOrder
  })
  const title = labels.itinerary ?? 'Tour itinerary'
  const lines: string[] = [
    `${title}: ${tour.name}`,
    tour.startDate || tour.endDate
      ? `${labels.date}: ${tour.startDate ?? '—'} → ${tour.endDate ?? '—'}`
      : '',
    '',
  ]

  for (const stop of sorted) {
    const city = [stop.venueCity, stop.venueCountry].filter(Boolean).join(', ')
    lines.push(
      `${stop.stopDate}  ${stop.isTravelDay ? (labels.travelDay ?? 'Travel') : (stop.venueName ?? labels.show)}`,
    )
    if (!stop.isTravelDay) {
      if (city) lines.push(`  ${city}`)
      lines.push(
        `  ${labels.status ?? 'Status'}: ${stop.showStatus}`,
        `  ${labels.stageTime}: ${stop.daySchedule?.stageTime ?? labels.tbd}`,
        `  ${labels.hotel ?? 'Hotel'}: ${stop.hotelName ?? stop.hotelCity ?? labels.tbd}`,
        `  ${labels.deal ?? 'Deal'}: ${dealSummary(stop.deal, labels)}`,
      )
    }
    lines.push('')
  }

  // Paginate roughly
  const pageHeight = 280
  let y = 16
  doc.setFontSize(11)
  for (const line of lines.filter(Boolean)) {
    if (y > pageHeight) {
      doc.addPage()
      y = 16
    }
    doc.text(line, 14, y)
    y += 6
  }
  const safeName = tour.name.replace(/[^\w\-]+/g, '_').slice(0, 40)
  doc.save(`tour-itinerary-${safeName}.pdf`)
}

/** Itinerary cover + day sheets for up to `maxDaySheets` upcoming non-travel stops. */
export function downloadTourProductionPackPdf(
  tour: Tour,
  stops: TourStop[],
  labels: TourPlannerPdfLabels,
  maxDaySheets = 10,
): void {
  downloadTourItineraryPdf(tour, stops, labels)
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = [...stops]
    .filter((s) => !s.isTravelDay && s.stopDate >= today)
    .sort((a, b) => a.stopDate.localeCompare(b.stopDate))
    .slice(0, maxDaySheets)

  for (const stop of upcoming) {
    const schedule = stop.daySchedule ?? {}
    downloadDaySheetPdf(stop, schedule, labels)
  }
}