/**
 * Tour production readiness score + structured issues for the Guided wizard.
 */

import type { Tour, TourStop } from '@/types'
import type { DaySchedule, DealStructure, ShowStatus } from '@/lib/tour-planner/types'

export type ReadinessSeverity = 'error' | 'warning' | 'info'

export interface ReadinessIssue {
  id: string
  severity: ReadinessSeverity
  stopId?: string
  field?: string
  titleKey: string
  bodyKey: string
  values?: Record<string, string | number>
  fixHintKey?: string
}

export interface TourReadiness {
  score: number
  issues: ReadinessIssue[]
  nextShowId: string | null
  hardBlocked: boolean
}

const CONFIRMED_STATUSES: ShowStatus[] = ['confirmed', 'contract-sent', 'deposit-paid']

function isConfirmed(status: ShowStatus): boolean {
  return CONFIRMED_STATUSES.includes(status)
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function dayDiff(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a) - Date.parse(b))
  return ms / (1000 * 60 * 60 * 24)
}

function hasStageTime(schedule: DaySchedule | null): boolean {
  return Boolean(schedule?.stageTime?.trim())
}

function hasDeal(deal: DealStructure | null): boolean {
  if (!deal) return false
  return Boolean(deal.type)
}

/**
 * Pure readiness evaluation for a tour + its stops.
 */
export function evaluateTourReadiness(
  tour: Tour | null,
  stops: TourStop[],
  options?: { now?: Date },
): TourReadiness {
  const now = options?.now ?? new Date()
  const issues: ReadinessIssue[] = []
  const sorted = [...stops].sort((a, b) => {
    const d = a.stopDate.localeCompare(b.stopDate)
    return d !== 0 ? d : a.sortOrder - b.sortOrder
  })

  if (!tour) {
    return { score: 0, issues: [], nextShowId: null, hardBlocked: true }
  }

  if (sorted.length === 0) {
    issues.push({
      id: 'no_stops',
      severity: 'error',
      titleKey: 'tour_guide_issue_no_stops_title',
      bodyKey: 'tour_guide_issue_no_stops_body',
      fixHintKey: 'tour_guide_issue_no_stops_fix',
    })
  }

  // Chronological order vs sort_order
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (prev.stopDate > cur.stopDate) {
      issues.push({
        id: `date_order-${cur.id}`,
        severity: 'error',
        stopId: cur.id,
        titleKey: 'tour_guide_issue_date_order_title',
        bodyKey: 'tour_guide_issue_date_order_body',
        values: { date: cur.stopDate, venue: cur.venueName ?? cur.venueCity ?? '—' },
        fixHintKey: 'tour_guide_issue_date_order_fix',
      })
      break
    }
  }

  // Same-day non-travel overlaps
  const byDate = new Map<string, TourStop[]>()
  for (const s of sorted) {
    if (s.isTravelDay) continue
    const list = byDate.get(s.stopDate) ?? []
    list.push(s)
    byDate.set(s.stopDate, list)
  }
  for (const [date, list] of byDate) {
    if (list.length > 1) {
      issues.push({
        id: `overlap-${date}`,
        severity: 'warning',
        stopId: list[0]?.id,
        titleKey: 'tour_guide_issue_overlap_title',
        bodyKey: 'tour_guide_issue_overlap_body',
        values: { date, count: list.length },
        fixHintKey: 'tour_guide_issue_overlap_fix',
      })
    }
  }

  // Radius protection
  const radiusKm = tour.settings?.radiusProtectionKm
  if (radiusKm && radiusKm > 0) {
    const shows = sorted.filter(
      (s) => !s.isTravelDay && s.venueLat != null && s.venueLng != null,
    )
    for (let i = 0; i < shows.length; i++) {
      for (let j = i + 1; j < shows.length; j++) {
        const a = shows[i]!
        const b = shows[j]!
        if (dayDiff(a.stopDate, b.stopDate) > 14) continue
        const km = haversineKm(a.venueLat!, a.venueLng!, b.venueLat!, b.venueLng!)
        if (km < radiusKm) {
          issues.push({
            id: `radius-${a.id}-${b.id}`,
            severity: 'warning',
            stopId: b.id,
            titleKey: 'tour_guide_issue_radius_title',
            bodyKey: 'tour_guide_issue_radius_body',
            values: {
              km: Math.round(km),
              radius: radiusKm,
              a: a.venueCity ?? a.venueName ?? a.stopDate,
              b: b.venueCity ?? b.venueName ?? b.stopDate,
            },
            fixHintKey: 'tour_guide_issue_radius_fix',
          })
        }
      }
    }
  }

  for (const s of sorted) {
    if (s.isTravelDay) continue

    if (s.venueLat == null || s.venueLng == null) {
      issues.push({
        id: `ungeocoded-${s.id}`,
        severity: 'warning',
        stopId: s.id,
        field: 'venue',
        titleKey: 'tour_guide_issue_ungeocoded_title',
        bodyKey: 'tour_guide_issue_ungeocoded_body',
        values: { venue: s.venueName ?? s.venueCity ?? s.stopDate },
        fixHintKey: 'tour_guide_issue_ungeocoded_fix',
      })
    }

    if (isConfirmed(s.showStatus) && !hasDeal(s.deal)) {
      issues.push({
        id: `deal-${s.id}`,
        severity: 'warning',
        stopId: s.id,
        field: 'deal',
        titleKey: 'tour_guide_issue_no_deal_title',
        bodyKey: 'tour_guide_issue_no_deal_body',
        values: { venue: s.venueName ?? s.stopDate },
        fixHintKey: 'tour_guide_issue_no_deal_fix',
      })
    }

    if (isConfirmed(s.showStatus) && !hasStageTime(s.daySchedule)) {
      issues.push({
        id: `schedule-${s.id}`,
        severity: 'warning',
        stopId: s.id,
        field: 'schedule',
        titleKey: 'tour_guide_issue_no_schedule_title',
        bodyKey: 'tour_guide_issue_no_schedule_body',
        values: { venue: s.venueName ?? s.stopDate },
        fixHintKey: 'tour_guide_issue_no_schedule_fix',
      })
    }

    if (isConfirmed(s.showStatus) && !s.hotelCity && !s.hotelName) {
      issues.push({
        id: `hotel-${s.id}`,
        severity: 'info',
        stopId: s.id,
        field: 'hotel',
        titleKey: 'tour_guide_issue_no_hotel_title',
        bodyKey: 'tour_guide_issue_no_hotel_body',
        values: { venue: s.venueName ?? s.stopDate },
        fixHintKey: 'tour_guide_issue_no_hotel_fix',
      })
    }
  }

  if (!tour.techDocuments?.length) {
    issues.push({
      id: 'missing_tech_docs',
      severity: 'info',
      titleKey: 'tour_guide_issue_tech_docs_title',
      bodyKey: 'tour_guide_issue_tech_docs_body',
      fixHintKey: 'tour_guide_issue_tech_docs_fix',
    })
  }

  if (!tour.budget?.lines?.length && tour.totalBudget == null) {
    issues.push({
      id: 'budget_empty',
      severity: 'info',
      titleKey: 'tour_guide_issue_budget_title',
      bodyKey: 'tour_guide_issue_budget_body',
      fixHintKey: 'tour_guide_issue_budget_fix',
    })
  }

  // Next show within 48h
  const today = now.toISOString().slice(0, 10)
  const upcoming = sorted.filter((s) => !s.isTravelDay && s.stopDate >= today)
  const nextShow = upcoming[0] ?? null
  if (nextShow) {
    const hours =
      (Date.parse(nextShow.stopDate + 'T12:00:00Z') - now.getTime()) / (1000 * 60 * 60)
    if (hours >= 0 && hours <= 48) {
      issues.push({
        id: `next48-${nextShow.id}`,
        severity: 'info',
        stopId: nextShow.id,
        titleKey: 'tour_guide_issue_next48_title',
        bodyKey: 'tour_guide_issue_next48_body',
        values: { venue: nextShow.venueName ?? nextShow.venueCity ?? nextShow.stopDate },
        fixHintKey: 'tour_guide_issue_next48_fix',
      })
    }
  }

  // Score: start 100, subtract weighted penalties
  let score = 100
  for (const issue of issues) {
    if (issue.severity === 'error') score -= 25
    else if (issue.severity === 'warning') score -= 8
    else score -= 3
  }
  score = Math.max(0, Math.min(100, score))

  const hardBlocked = issues.some((i) => i.severity === 'error')

  return {
    score,
    issues,
    nextShowId: nextShow?.id ?? null,
    hardBlocked,
  }
}

/** Concerts not yet linked as stops on this tour. */
export function filterImportableConcerts<T extends { id: string; concertDate?: string }>(
  concerts: T[],
  stops: TourStop[],
  options?: { fromDate?: string },
): T[] {
  const linked = new Set(stops.map((s) => s.concertId).filter(Boolean) as string[])
  const from = options?.fromDate
  return concerts.filter((c) => {
    if (linked.has(c.id)) return false
    if (from && c.concertDate && c.concertDate < from) return false
    return true
  })
}

export function suggestTourName(artistName: string, year = new Date().getFullYear()): string {
  const base = artistName.trim() || 'Tour'
  return `${base} ${year}`
}

export function deriveTourDateRange(stops: TourStop[]): {
  startDate: string | null
  endDate: string | null
} {
  if (stops.length === 0) return { startDate: null, endDate: null }
  const dates = stops.map((s) => s.stopDate).sort()
  return { startDate: dates[0] ?? null, endDate: dates[dates.length - 1] ?? null }
}
