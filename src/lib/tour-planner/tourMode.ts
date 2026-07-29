/**
 * Pure helpers for show-day Tour Mode (offline-friendly navigation).
 */

import type { Tour, TourStop } from '@/types'

export function sortStopsChronological(stops: TourStop[]): TourStop[] {
  return [...stops].sort((a, b) => {
    const d = a.stopDate.localeCompare(b.stopDate)
    return d !== 0 ? d : a.sortOrder - b.sortOrder
  })
}

/** Prefer non-travel shows from today onward; else last past stop; else first stop. */
export function pickFocusStop(
  stops: TourStop[],
  options?: { now?: Date; preferredStopId?: string | null },
): TourStop | null {
  const sorted = sortStopsChronological(stops)
  if (sorted.length === 0) return null

  if (options?.preferredStopId) {
    const hit = sorted.find((s) => s.id === options.preferredStopId)
    if (hit) return hit
  }

  const today = (options?.now ?? new Date()).toISOString().slice(0, 10)
  const upcoming = sorted.filter((s) => s.stopDate >= today)
  if (upcoming.length > 0) {
    const show = upcoming.find((s) => !s.isTravelDay)
    return show ?? upcoming[0]!
  }

  const pastShows = sorted.filter((s) => !s.isTravelDay)
  return pastShows[pastShows.length - 1] ?? sorted[sorted.length - 1]!
}

export function neighborStops(
  stops: TourStop[],
  currentId: string,
): { prev: TourStop | null; next: TourStop | null } {
  const sorted = sortStopsChronological(stops)
  const idx = sorted.findIndex((s) => s.id === currentId)
  if (idx < 0) return { prev: null, next: null }
  return {
    prev: idx > 0 ? sorted[idx - 1]! : null,
    next: idx < sorted.length - 1 ? sorted[idx + 1]! : null,
  }
}

/** Active (non-archived) tour that contains the next upcoming stop, else first tour. */
export function pickTourForMode(
  tours: Tour[],
  stopsByTourId: Map<string, TourStop[]>,
  options?: { preferredTourId?: string | null; now?: Date },
): Tour | null {
  const active = tours.filter((t) => !t.archived)
  if (active.length === 0) return null

  if (options?.preferredTourId) {
    const hit = active.find((t) => t.id === options.preferredTourId)
    if (hit) return hit
  }

  const today = (options?.now ?? new Date()).toISOString().slice(0, 10)
  let best: { tour: Tour; date: string } | null = null

  for (const tour of active) {
    const stops = stopsByTourId.get(tour.id) ?? []
    const upcoming = sortStopsChronological(stops).filter((s) => s.stopDate >= today)
    const focus = upcoming.find((s) => !s.isTravelDay) ?? upcoming[0]
    if (!focus) continue
    if (!best || focus.stopDate < best.date) {
      best = { tour, date: focus.stopDate }
    }
  }

  return best?.tour ?? active[0]!
}

export function mapsUrl(stop: TourStop): string | null {
  if (stop.venueLat != null && stop.venueLng != null) {
    return `https://www.google.com/maps?q=${stop.venueLat},${stop.venueLng}`
  }
  const q = [stop.venueName, stop.venueAddress, stop.venueCity, stop.venueCountry]
    .filter(Boolean)
    .join(', ')
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function dealFrameworkLabel(stop: TourStop): string | null {
  const d = stop.deal
  if (!d?.type) return null
  const parts: string[] = [String(d.type)]
  if (d.guarantee != null) parts.push(`${d.guarantee} ${d.currency}`)
  if (d.doorSplitPercentage != null) parts.push(`${d.doorSplitPercentage}%`)
  return parts.join(' · ')
}
