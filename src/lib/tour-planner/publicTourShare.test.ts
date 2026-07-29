import { describe, expect, it } from 'vitest'
import type { Tour, TourStop } from '@/types'
import { DEFAULT_TOUR_PLANNER_SETTINGS } from '@/lib/tour-planner/types'
import { assertPublicTourSafe, buildPublicTourView } from './publicTourShare'

const tour: Tour = {
  id: 'tour-1',
  artistId: 'a1',
  name: 'Summer Run',
  description: 'DE/AT',
  startDate: '2026-08-01',
  endDate: '2026-08-10',
  archived: false,
  sortOrder: 0,
  settings: DEFAULT_TOUR_PLANNER_SETTINGS,
  routeCache: null,
  budget: null,
  techDocuments: [],
  currency: 'EUR',
  totalBudget: null,
  createdBy: null,
  createdAt: '',
  updatedAt: '',
}

const stop: TourStop = {
  id: 's1',
  tourId: 'tour-1',
  artistId: 'a1',
  concertId: null,
  sortOrder: 0,
  stopDate: '2026-08-01',
  isTravelDay: false,
  venueName: 'Astra',
  venueAddress: 'Street 1',
  venueCity: 'Berlin',
  venueCountry: 'DE',
  venueLat: 1,
  venueLng: 2,
  venueValidated: true,
  hotelName: 'Hotel X',
  hotelAddress: 'Secret',
  hotelCity: 'Berlin',
  hotelCountry: 'DE',
  hotelLat: null,
  hotelLng: null,
  hotelValidated: false,
  arrivalTime: null,
  showStatus: 'confirmed',
  daySchedule: { stageTime: '21:00', doors: '20:00' },
  deal: { type: 'guarantee', guarantee: 2500, currency: 'EUR' },
  settlement: {
    ticketsSold: 100,
    ticketPrice: 20,
    grossRevenue: 2000,
    venueCosts: 0,
    netRevenue: 2000,
    artistPayment: 2500,
  },
  perDiems: [{ personId: 'p', personName: 'A', amount: 50, currency: 'EUR', date: '2026-08-01', paid: false }],
  rooming: [],
  travelManifest: [],
  venueDetails: null,
  venueContactInfo: null,
  guestList: [{ id: 'g1', name: 'VIP', showId: 's1', numberOfGuests: 2 }],
  guestListLimit: 10,
  notes: 'PRIVATE',
  externalGuestNotes: null,
  performingArtistIds: [],
  privateDataVersion: null,
  privateDataUpdatedAt: null,
  createdAt: '',
  updatedAt: '',
}

describe('buildPublicTourView', () => {
  it('includes logistics and deal framework, excludes private bags', () => {
    const view = buildPublicTourView(tour, [stop], 'Nightfall')
    expect(view.name).toBe('Summer Run')
    expect(view.stops[0]?.venueCity).toBe('Berlin')
    expect(view.stops[0]?.deal?.guarantee).toBe(2500)
    expect(view.stops[0]?.daySchedule?.stageTime).toBe('21:00')
    expect(assertPublicTourSafe(view)).toBeUndefined()
    // settlement / guest list must not appear as object keys on stop
    expect(view.stops[0]).not.toHaveProperty('settlement')
    expect(view.stops[0]).not.toHaveProperty('guestList')
    expect(view.stops[0]).not.toHaveProperty('perDiems')
    expect(view.stops[0]).not.toHaveProperty('notes')
  })
})
