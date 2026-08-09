import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPromoTracks, createPromoTrack, deletePromoTrack } from './promoTracks'

type DbClient = SupabaseClient<Database>
type PromoTrackRow = Database['public']['Tables']['promo_tracks']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const mockTrackRow: PromoTrackRow = {
  organization_id: '00000000-0000-0000-0000-000000000000',
  id: 'track-uuid-1',
  title: 'Unreleased Banger',
  artist_name: 'darkArtist',
  artist_id: null,
  r2_key: 'promo-tracks/track-uuid-1.wav',
  file_size_bytes: 52428800,
  duration_seconds: 210,
  display_order: 0,
  genre: 'darkwave',
  bpm: 128,
  key: 'Am',
  release_date: '2024-08-01',
  nda_required: true,
  embargo_until: '2024-07-01T12:00:00Z',
  created_at: '2024-06-01T00:00:00Z',
}

describe('getPromoTracks', () => {
  it('returns empty array when no tracks exist', async () => {
    const db = makeMockDb([])
    const result = await getPromoTracks(db)
    expect(result).toEqual([])
  })

  it('maps rows to PromoTrack domain objects', async () => {
    const db = makeMockDb([mockTrackRow])
    const result = await getPromoTracks(db)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('track-uuid-1')
    expect(result[0].title).toBe('Unreleased Banger')
    expect(result[0].artistName).toBe('darkArtist')
    expect(result[0].r2Key).toBe('promo-tracks/track-uuid-1.wav')
    expect(result[0].fileSizeBytes).toBe(52428800)
    expect(result[0].durationSeconds).toBe(210)
    expect(result[0].genre).toBe('darkwave')
    expect(result[0].bpm).toBe(128)
    expect(result[0].key).toBe('Am')
    expect(result[0].releaseDate).toBe('2024-08-01')
    expect(result[0].ndaRequired).toBe(true)
    expect(result[0].embargoUntil).toBe('2024-07-01T12:00:00Z')
  })

  it('maps null optional fields to undefined', async () => {
    const rowWithNulls: PromoTrackRow = {
      ...mockTrackRow,
      file_size_bytes: null,
      duration_seconds: null,
      genre: null,
      bpm: null,
      key: null,
      release_date: null,
      nda_required: false,
      embargo_until: null,
    }
    const db = makeMockDb([rowWithNulls])
    const result = await getPromoTracks(db)
    expect(result[0].fileSizeBytes).toBeUndefined()
    expect(result[0].durationSeconds).toBeUndefined()
    expect(result[0].genre).toBeUndefined()
    expect(result[0].bpm).toBeUndefined()
    expect(result[0].key).toBeUndefined()
    expect(result[0].releaseDate).toBeUndefined()
    expect(result[0].ndaRequired).toBe(false)
    expect(result[0].embargoUntil).toBeUndefined()
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'RLS violation', code: 'PGRST301' })
    await expect(getPromoTracks(db)).rejects.toThrow('RLS violation')
  })
})

describe('createPromoTrack', () => {
  it('inserts and returns the mapped domain object', async () => {
    const db = makeMockDb(mockTrackRow)
    const result = await createPromoTrack(db, {
      title: 'Unreleased Banger',
      artist_name: 'darkArtist',
      r2_key: 'promo-tracks/track-uuid-1.wav',
      file_size_bytes: 52428800,
    })
    expect(result.id).toBe('track-uuid-1')
    expect(result.artistName).toBe('darkArtist')
    expect(result.r2Key).toBe('promo-tracks/track-uuid-1.wav')
    expect(result.fileSizeBytes).toBe(52428800)
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'duplicate key', code: '23505' })
    await expect(
      createPromoTrack(db, {
        title: 'Dup',
        artist_name: 'Artist',
        r2_key: 'dup',
      }),
    ).rejects.toThrow('duplicate key')
  })

  it('throws when no row is returned', async () => {
    const db = makeMockDb(null, null)
    await expect(
      createPromoTrack(db, {
        title: 'Empty',
        artist_name: 'Artist',
        r2_key: 'empty',
      }),
    ).rejects.toThrow('No data returned from createPromoTrack')
  })
})

describe('deletePromoTrack', () => {
  it('resolves without error on success', async () => {
    const db = makeMockDb(null, null)
    await expect(deletePromoTrack(db, 'track-uuid-1')).resolves.toBeUndefined()
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'not found', code: 'PGRST116' })
    await expect(deletePromoTrack(db, 'missing-id')).rejects.toThrow('not found')
  })
})
