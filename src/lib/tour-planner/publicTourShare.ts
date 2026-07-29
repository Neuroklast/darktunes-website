/**
 * Sanitized public tour payload for read-only share links.
 * Logistics + deal framework only — no settlements/guest lists/per-diems.
 */

import type { Tour, TourStop } from '@/types'
import type { DaySchedule, DealStructure, ShowStatus } from '@/lib/tour-planner/types'

export interface PublicDealFramework {
  type: DealStructure['type']
  guarantee?: number
  doorSplitPercentage?: number
  versusAmount?: number
  versusPercentage?: number
  currency: string
}

export interface PublicTourStop {
  id: string
  stopDate: string
  isTravelDay: boolean
  sortOrder: number
  venueName: string | null
  venueAddress: string | null
  venueCity: string | null
  venueCountry: string | null
  showStatus: ShowStatus
  daySchedule: DaySchedule | null
  hotelName: string | null
  hotelCity: string | null
  deal: PublicDealFramework | null
}

export interface PublicTourView {
  tourId: string
  name: string
  description: string | null
  startDate: string | null
  endDate: string | null
  currency: string
  artistName: string | null
  stops: PublicTourStop[]
}

function sanitizeDeal(deal: DealStructure | null): PublicDealFramework | null {
  if (!deal?.type) return null
  return {
    type: deal.type,
    guarantee: deal.guarantee,
    doorSplitPercentage: deal.doorSplitPercentage,
    versusAmount: deal.versusAmount,
    versusPercentage: deal.versusPercentage,
    currency: deal.currency,
  }
}

function sanitizeSchedule(schedule: DaySchedule | null): DaySchedule | null {
  if (!schedule) return null
  return {
    getIn: schedule.getIn,
    soundcheck: schedule.soundcheck,
    doors: schedule.doors,
    stageTime: schedule.stageTime,
    curfew: schedule.curfew,
    dinnerTime: schedule.dinnerTime,
    lobbyCall: schedule.lobbyCall,
    hotelDeparture: schedule.hotelDeparture,
    driveTime: schedule.driveTime,
    timezone: schedule.timezone,
  }
}

export function buildPublicTourView(
  tour: Tour,
  stops: TourStop[],
  artistName: string | null = null,
): PublicTourView {
  const sorted = [...stops].sort((a, b) => {
    const d = a.stopDate.localeCompare(b.stopDate)
    return d !== 0 ? d : a.sortOrder - b.sortOrder
  })

  return {
    tourId: tour.id,
    name: tour.name,
    description: tour.description,
    startDate: tour.startDate,
    endDate: tour.endDate,
    currency: tour.currency,
    artistName,
    stops: sorted.map((s) => ({
      id: s.id,
      stopDate: s.stopDate,
      isTravelDay: s.isTravelDay,
      sortOrder: s.sortOrder,
      venueName: s.venueName,
      venueAddress: s.venueAddress,
      venueCity: s.venueCity,
      venueCountry: s.venueCountry,
      showStatus: s.showStatus,
      daySchedule: sanitizeSchedule(s.daySchedule),
      hotelName: s.hotelName,
      hotelCity: s.hotelCity,
      deal: sanitizeDeal(s.deal),
    })),
  }
}

/** Assert public view never carries private bags (test helper). */
export function assertPublicTourSafe(view: PublicTourView): void {
  const raw = JSON.stringify(view)
  const banned = ['settlement', 'guestList', 'perDiems', 'rooming', 'travelManifest', 'notes']
  for (const key of banned) {
    if (raw.includes(`"${key}"`)) {
      throw new Error(`Public tour view leaked private key: ${key}`)
    }
  }
}
