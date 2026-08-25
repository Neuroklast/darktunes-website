import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getConcerts,
  getConcertsByArtistId,
  getAllVisibleConcertsForCalendar,
  createConcert,
  updateConcert,
  deleteConcert,
} from './concerts'

type DbClient = SupabaseClient<Database>
type ConcertRow = Database['public']['Tables']['concerts']['Row']
type ConcertRowWithArtist = ConcertRow & { artists?: { name: string } | null }

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

/**
 * Creates a mock DbClient where the first `from()` call returns junctionData/junctionError
 * and all subsequent calls return concertData/concertError. Used for the two-step
 * getConcertsByArtistId query (junction lookup + concerts fetch).
 */
function makeTwoStepMockDb(
  junctionData: unknown,
  concertData: unknown,
  junctionError: unknown = null,
  concertError: unknown = null,
): DbClient {
  const fromMock = vi.fn()
    .mockReturnValueOnce(makeBuilder(junctionData, junctionError))
    .mockReturnValue(makeBuilder(concertData, concertError))
  return { from: fromMock } as unknown as DbClient
}

const mockConcerts: ConcertRowWithArtist[] = [
  {
    id: 'concert-cancelled',
    organization_id: '00000000-0000-0000-0000-000000000000',
    artist_id: 'artist-1',
    artists: { name: 'Artist A' },
    event_name: 'Cancelled Show',
    venue_name: 'Venue A',
    venue_address: null,
    venue_city: 'Berlin',
    venue_country: 'Germany',
    concert_date: '2026-08-10T19:00:00Z',
    ticket_url: null,
    songkick_id: 'sk-1',
    bandsintown_id: null,
    status: 'cancelled',
    created_by: null,
    source: 'admin',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    event_time: null,
    event_type: 'gig',
    trailer_url: null,
    venue_lat: null,
    venue_lng: null,
    venue_osm_id: null,
    news_post_id: null,
  },
  {
    id: 'concert-ok',
    organization_id: '00000000-0000-0000-0000-000000000000',
    artist_id: 'artist-2',
    artists: { name: 'Artist B' },
    event_name: 'Upcoming Show',
    venue_name: 'Venue B',
    venue_address: null,
    venue_city: 'Hamburg',
    venue_country: 'Germany',
    concert_date: '2026-09-10T19:00:00Z',
    ticket_url: 'https://tickets.example.com',
    songkick_id: 'sk-2',
    bandsintown_id: null,
    status: 'ok',
    created_by: null,
    source: 'admin',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    event_time: '20:00',
    event_type: 'dj_set',
    trailer_url: null,
    venue_lat: 53.5503,
    venue_lng: 9.9928,
    venue_osm_id: '62782',
    news_post_id: null,
  },
]

describe('getConcerts', () => {
  it('returns an empty array when no concerts exist', async () => {
    const db = makeMockDb([])
    await expect(getConcerts(db)).resolves.toEqual([])
  })

  it('maps rows and sorts with status ok first', async () => {
    const db = makeMockDb(mockConcerts)
    const result = await getConcerts(db)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('concert-ok')
    expect(result[0].artistName).toBe('Artist B')
    expect(result[1].id).toBe('concert-cancelled')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Concert query failed', code: 'PGRST001' })
    await expect(getConcerts(db)).rejects.toThrow('Concert query failed')
  })
})

describe('getConcertsByArtistId', () => {
  it('returns an empty array when no concerts exist for the artist', async () => {
    const db = makeTwoStepMockDb([], [])
    await expect(getConcertsByArtistId(db, 'artist-1')).resolves.toEqual([])
  })

  it('returns concerts where the artist is the primary artist', async () => {
    const db = makeTwoStepMockDb([], [mockConcerts[0]])
    const result = await getConcertsByArtistId(db, 'artist-1')
    expect(result).toHaveLength(1)
    expect(result[0].artistId).toBe('artist-1')
  })

  it('returns concerts where the artist is featured in concert_artists but is not the primary artist', async () => {
    // artist-3 is not the primary artist on concert-ok but appears in concert_artists
    const db = makeTwoStepMockDb(
      [{ concert_id: 'concert-ok' }],
      [mockConcerts[1]],
    )
    const result = await getConcertsByArtistId(db, 'artist-3')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('concert-ok')
  })

  it('deduplicates when artist is both primary and featured in concert_artists', async () => {
    // artist-1 is the primary artist AND appears in concert_artists for concert-cancelled
    const db = makeTwoStepMockDb(
      [{ concert_id: 'concert-cancelled' }],
      [mockConcerts[0], mockConcerts[0]], // OR query could return the same row twice
    )
    const result = await getConcertsByArtistId(db, 'artist-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('concert-cancelled')
  })

  it('throws on junction table database error', async () => {
    const db = makeTwoStepMockDb(null, null, { message: 'Artist concert query failed', code: 'PGRST001' })
    await expect(getConcertsByArtistId(db, 'artist-1')).rejects.toThrow('Artist concert query failed')
  })

  it('throws on concerts database error', async () => {
    const db = makeTwoStepMockDb([], null, null, { message: 'Concerts query failed', code: 'PGRST001' })
    await expect(getConcertsByArtistId(db, 'artist-1')).rejects.toThrow('Concerts query failed')
  })
})

describe('createConcert', () => {
  it('creates and maps a concert row', async () => {
    const db = makeMockDb(mockConcerts[0])
    const result = await createConcert(db, {
      event_name: 'Cancelled Show',
      concert_date: '2026-08-10',
    })
    expect(result.id).toBe('concert-cancelled')
  })
})

describe('updateConcert', () => {
  it('updates and maps a concert row', async () => {
    const db = makeMockDb({ ...mockConcerts[0], event_name: 'Updated Show' })
    const result = await updateConcert(db, 'concert-cancelled', { event_name: 'Updated Show' })
    expect(result.eventName).toBe('Updated Show')
  })
})

describe('deleteConcert', () => {
  it('deletes a concert row', async () => {
    const db = makeMockDb(null)
    await expect(deleteConcert(db, 'concert-id')).resolves.toBeUndefined()
  })
})

describe('getAllVisibleConcertsForCalendar', () => {
  it('maps nested artists in a single select (past + future)', async () => {
    const calendarRow = {
      id: 'cal-c1',
  organization_id: '00000000-0000-0000-0000-000000000000',
      artist_id: 'art-1',
      event_name: 'Spring Show',
      venue_name: 'Arena',
      venue_city: 'Berlin',
      venue_country: 'DE',
      concert_date: '2025-04-01',
      ticket_url: 'https://example.com/t',
      status: 'ok',
      event_time: '20:00',
      event_type: 'gig',
      artists: { id: 'art-1', name: 'Alpha', slug: 'alpha', is_visible: true },
      concert_artists: [
        {
          sort_order: 0,
          artists: { id: 'art-2', name: 'Beta', slug: 'beta', is_visible: true },
        },
      ],
    }
    const builder = makeBuilder([calendarRow], null)
    const db = { from: vi.fn().mockReturnValue(builder) } as unknown as DbClient

    const result = await getAllVisibleConcertsForCalendar(db)
    expect(result).toHaveLength(1)
    expect(result[0].eventName).toBe('Spring Show')
    expect(result[0].artistName).toBe('Alpha')
    expect(result[0].featuredArtists).toEqual([
      { id: 'art-2', name: 'Beta', slug: 'beta' },
    ])
    expect(builder.limit).toHaveBeenCalled()
    // No gte(today) — calendar needs history + future
    expect(builder.gte).not.toHaveBeenCalled()
    expect(db.from).toHaveBeenCalledTimes(1)
  })

  it('drops concerts whose only artists are hidden', async () => {
    const calendarRow = {
      id: 'cal-hidden',
      artist_id: 'art-x',
      event_name: 'Ghost Gig',
      venue_name: null,
      venue_city: null,
      venue_country: null,
      concert_date: '2025-01-01',
      ticket_url: null,
      status: 'ok',
      event_time: null,
      event_type: 'gig',
      artists: { id: 'art-x', name: 'Hidden', slug: 'hidden', is_visible: false },
      concert_artists: [],
    }
    const db = {
      from: vi.fn().mockReturnValue(makeBuilder([calendarRow], null)),
    } as unknown as DbClient

    const result = await getAllVisibleConcertsForCalendar(db)
    expect(result).toEqual([])
  })
})
