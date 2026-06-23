import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { logBioEvent } from './bioEvents'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error, count: null }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const eventRow = {
  id: 'evt-1',
  artist_id: 'artist-1',
  journalist_id: 'user-1',
  event_type: 'copy' as const,
  locale: 'de' as const,
  tier: 'short' as const,
  format: null,
  created_at: '2026-01-01T00:00:00Z',
}

describe('bioEvents DAL', () => {
  it('logs a bio event', async () => {
    const db = makeMockDb(eventRow)
    const event = await logBioEvent(db, {
      artistId: 'artist-1',
      eventType: 'copy',
      journalistId: 'user-1',
      locale: 'de',
      tier: 'short',
    })
    expect(event.eventType).toBe('copy')
    expect(event.tier).toBe('short')
  })
})