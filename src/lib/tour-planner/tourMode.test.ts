import { describe, expect, it } from 'vitest'
import type { TourStop } from '@/types'
import { neighborStops, pickFocusStop, sortStopsChronological } from './tourMode'

function stop(partial: Partial<TourStop> & Pick<TourStop, 'id' | 'stopDate'>): TourStop {
  return {
    tourId: 't1',
    artistId: 'a1',
    concertId: null,
    sortOrder: 0,
    isTravelDay: false,
    venueName: 'V',
    venueAddress: null,
    venueCity: 'Berlin',
    venueCountry: 'DE',
    venueLat: null,
    venueLng: null,
    venueValidated: false,
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
    createdAt: '',
    updatedAt: '',
    ...partial,
  }
}

describe('tourMode helpers', () => {
  it('picks preferred stop when present', () => {
    const stops = [
      stop({ id: 'a', stopDate: '2026-08-01' }),
      stop({ id: 'b', stopDate: '2026-08-05' }),
    ]
    expect(pickFocusStop(stops, { preferredStopId: 'b' })?.id).toBe('b')
  })

  it('picks next upcoming show from today', () => {
    const stops = [
      stop({ id: 'past', stopDate: '2026-07-01' }),
      stop({ id: 'soon', stopDate: '2026-08-10' }),
      stop({ id: 'later', stopDate: '2026-09-01' }),
    ]
    expect(
      pickFocusStop(stops, { now: new Date('2026-08-01T12:00:00Z') })?.id,
    ).toBe('soon')
  })

  it('neighbors wrap chronologically', () => {
    const stops = sortStopsChronological([
      stop({ id: 'b', stopDate: '2026-08-05', sortOrder: 1 }),
      stop({ id: 'a', stopDate: '2026-08-01', sortOrder: 0 }),
      stop({ id: 'c', stopDate: '2026-08-10', sortOrder: 2 }),
    ])
    expect(neighborStops(stops, 'b').prev?.id).toBe('a')
    expect(neighborStops(stops, 'b').next?.id).toBe('c')
  })
})
