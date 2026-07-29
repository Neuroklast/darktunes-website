import { describe, expect, it } from 'vitest'
import type { Tour, TourStop } from '@/types'
import { DEFAULT_TOUR_PLANNER_SETTINGS } from '@/lib/tour-planner/types'
import {
  deriveTourDateRange,
  evaluateTourReadiness,
  filterImportableConcerts,
  suggestTourName,
} from './tourReadiness'

function tour(partial: Partial<Tour> = {}): Tour {
  return {
    id: 'tour-1',
    artistId: 'artist-1',
    name: 'Test Tour',
    description: null,
    startDate: null,
    endDate: null,
    archived: false,
    sortOrder: 0,
    settings: { ...DEFAULT_TOUR_PLANNER_SETTINGS, radiusProtectionKm: 50 },
    routeCache: null,
    budget: null,
    techDocuments: [],
    currency: 'EUR',
    totalBudget: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

function stop(partial: Partial<TourStop> & Pick<TourStop, 'id' | 'stopDate'>): TourStop {
  return {
    tourId: 'tour-1',
    artistId: 'artist-1',
    concertId: null,
    sortOrder: 0,
    isTravelDay: false,
    venueName: 'Venue',
    venueAddress: null,
    venueCity: 'Berlin',
    venueCountry: 'DE',
    venueLat: 52.52,
    venueLng: 13.4,
    venueValidated: true,
    hotelName: null,
    hotelAddress: null,
    hotelCity: null,
    hotelCountry: null,
    hotelLat: null,
    hotelLng: null,
    hotelValidated: false,
    arrivalTime: null,
    showStatus: 'option',
    daySchedule: null,
    deal: null,
    settlement: null,
    perDiems: [],
    rooming: [],
    travelManifest: [],
    venueDetails: null,
    venueContactInfo: null,
    guestList: [],
    guestListLimit: null,
    notes: null,
    externalGuestNotes: null,
    performingArtistIds: [],
    privateDataVersion: null,
    privateDataUpdatedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('evaluateTourReadiness', () => {
  it('flags empty tour as hard blocked', () => {
    const r = evaluateTourReadiness(tour(), [])
    expect(r.hardBlocked).toBe(true)
    expect(r.issues.some((i) => i.id === 'no_stops')).toBe(true)
    expect(r.score).toBeLessThan(100)
  })

  it('warns when confirmed show has no deal or stage time', () => {
    const r = evaluateTourReadiness(tour(), [
      stop({
        id: 's1',
        stopDate: '2026-08-01',
        showStatus: 'confirmed',
        daySchedule: null,
        deal: null,
        hotelCity: 'Berlin',
      }),
    ])
    expect(r.issues.some((i) => i.id === 'deal-s1')).toBe(true)
    expect(r.issues.some((i) => i.id === 'schedule-s1')).toBe(true)
  })

  it('detects same-day non-travel overlap', () => {
    const r = evaluateTourReadiness(tour(), [
      stop({ id: 's1', stopDate: '2026-08-01', sortOrder: 0 }),
      stop({ id: 's2', stopDate: '2026-08-01', sortOrder: 1, venueName: 'Other' }),
    ])
    expect(r.issues.some((i) => i.id.startsWith('overlap-'))).toBe(true)
  })

  it('detects radius clash for nearby shows', () => {
    const r = evaluateTourReadiness(tour(), [
      stop({
        id: 's1',
        stopDate: '2026-08-01',
        venueLat: 52.52,
        venueLng: 13.4,
        venueCity: 'Berlin',
      }),
      stop({
        id: 's2',
        stopDate: '2026-08-03',
        venueLat: 52.53,
        venueLng: 13.41,
        venueCity: 'Berlin2',
        sortOrder: 1,
      }),
    ])
    expect(r.issues.some((i) => i.id.startsWith('radius-'))).toBe(true)
  })

  it('scores higher when tour is complete', () => {
    const r = evaluateTourReadiness(
      tour({
        techDocuments: [
          {
            id: 'd1',
            name: 'rider.pdf',
            type: 'tech-rider',
            uploadedAt: '2026-01-01T00:00:00Z',
          },
        ],
        totalBudget: 10000,
        budget: {
          lines: [
            {
              id: 'b1',
              category: 'transport',
              label: 'Bus',
              planned: 1000,
            },
          ],
        },
      }),
      [
        stop({
          id: 's1',
          stopDate: '2026-08-01',
          showStatus: 'confirmed',
          daySchedule: { stageTime: '21:00' },
          deal: { type: 'guarantee', guarantee: 1000, currency: 'EUR' },
          hotelCity: 'Berlin',
        }),
      ],
    )
    expect(r.hardBlocked).toBe(false)
    expect(r.score).toBeGreaterThan(70)
  })
})

describe('helpers', () => {
  it('suggestTourName', () => {
    expect(suggestTourName('Nightfall', 2026)).toBe('Nightfall 2026')
  })

  it('deriveTourDateRange', () => {
    expect(
      deriveTourDateRange([
        stop({ id: 'a', stopDate: '2026-09-01' }),
        stop({ id: 'b', stopDate: '2026-08-01', sortOrder: 1 }),
      ]),
    ).toEqual({ startDate: '2026-08-01', endDate: '2026-09-01' })
  })

  it('filterImportableConcerts skips linked', () => {
    const concerts = [
      { id: 'c1', concertDate: '2026-09-01' },
      { id: 'c2', concertDate: '2026-10-01' },
    ]
    const stops = [stop({ id: 's1', stopDate: '2026-09-01', concertId: 'c1' })]
    expect(filterImportableConcerts(concerts, stops).map((c) => c.id)).toEqual(['c2'])
  })
})
