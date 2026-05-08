import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getConcerts, upsertConcert, deleteConcert } from './concerts'

type DbClient = SupabaseClient<Database>
type ConcertRow = Database['public']['Tables']['concerts']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const mockConcertRow: ConcertRow = {
  id: 'concert-001',
  artist_id: 'artist-abc',
  artist_name: 'C Z A R I N A',
  event_name: 'Dark Nights Festival',
  venue_name: 'Berghain',
  city: 'Berlin',
  country: 'DE',
  event_date: '2026-09-15',
  ticket_url: 'https://tickets.example.com/dark-nights',
  songkick_id: 'sk-9876',
  status: 'upcoming',
  created_at: '2026-05-08T00:00:00Z',
  updated_at: '2026-05-08T00:00:00Z',
}

describe('getConcerts', () => {
  it('returns empty array when no concerts exist', async () => {
    const db = makeMockDb([])
    expect(await getConcerts(db)).toEqual([])
  })

  it('maps rows to Concert domain objects', async () => {
    const db = makeMockDb([mockConcertRow])
    const [concert] = await getConcerts(db)
    expect(concert.id).toBe('concert-001')
    expect(concert.artistName).toBe('C Z A R I N A')
    expect(concert.eventName).toBe('Dark Nights Festival')
    expect(concert.city).toBe('Berlin')
    expect(concert.status).toBe('upcoming')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'DB error', code: 'PGRST001' })
    await expect(getConcerts(db)).rejects.toThrow('DB error')
  })
})

describe('upsertConcert', () => {
  it('returns the upserted Concert', async () => {
    const db = makeMockDb(mockConcertRow)
    const result = await upsertConcert(db, {
      artist_name: 'C Z A R I N A',
      event_name: 'Dark Nights Festival',
      event_date: '2026-09-15',
      songkick_id: 'sk-9876',
    })
    expect(result.id).toBe('concert-001')
    expect(result.venueName).toBe('Berghain')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'conflict', code: '23505' })
    await expect(
      upsertConcert(db, { artist_name: 'Test', event_name: 'Gig', event_date: '2026-01-01' }),
    ).rejects.toThrow('conflict')
  })
})

describe('deleteConcert', () => {
  it('resolves without error on success', async () => {
    const db = makeMockDb(null, null)
    await expect(deleteConcert(db, 'concert-001')).resolves.toBeUndefined()
  })

  it('throws when deletion fails', async () => {
    const db = makeMockDb(null, { message: 'delete denied', code: 'PGRST301' })
    await expect(deleteConcert(db, 'concert-001')).rejects.toThrow('delete denied')
  })
})
