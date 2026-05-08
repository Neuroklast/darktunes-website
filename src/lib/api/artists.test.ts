import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getArtists, createArtist, updateArtist, deleteArtist, getArtistById } from './artists'

type DbClient = SupabaseClient<Database>
type ArtistRow = Database['public']['Tables']['artists']['Row']

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

const mockArtistRow: ArtistRow = {
  id: 'abc-123',
  name: 'C Z A R I N A',
  slug: 'czarina',
  bio: 'Dark electronic pop',
  genres: ['Darkpop', 'Industrial'],
  image_url: 'https://example.com/img.jpg',
  spotify_url: 'https://open.spotify.com/artist/czarina',
  instagram_url: null,
  youtube_url: null,
  website_url: null,
  featured: true,
  country: 'USA',
  email: null,
  vat_number: null,
  is_eu_non_german: false,
  notes: null,
  spotify_id: null,
  discogs_id: null,
  songkick_id: null,
  last_synced_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('getArtists', () => {
  it('returns an empty array when there are no artists', async () => {
    const db = makeMockDb([])
    const result = await getArtists(db)
    expect(result).toEqual([])
  })

  it('maps rows to Artist domain objects', async () => {
    const db = makeMockDb([mockArtistRow])
    const result = await getArtists(db)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('C Z A R I N A')
    expect(result[0].id).toBe('abc-123')
    expect(result[0].genres).toEqual(['Darkpop', 'Industrial'])
  })

  it('throws on error', async () => {
    const db = makeMockDb(null, { message: 'DB error', code: 'PGRST001' })
    await expect(getArtists(db)).rejects.toThrow('DB error')
  })
})

describe('getArtistById', () => {
  it('returns null when artist not found (PGRST116)', async () => {
    const db = makeMockDb(null, { message: 'Not found', code: 'PGRST116' })
    const result = await getArtistById(db, 'nonexistent')
    expect(result).toBeNull()
  })

  it('throws for non-PGRST116 errors', async () => {
    const db = makeMockDb(null, { message: 'Permission denied', code: 'PGRST301' })
    await expect(getArtistById(db, 'some-id')).rejects.toThrow('Permission denied')
  })

  it('returns mapped Artist for found row', async () => {
    const db = makeMockDb(mockArtistRow)
    const result = await getArtistById(db, mockArtistRow.id)
    expect(result).not.toBeNull()
    expect(result?.name).toBe('C Z A R I N A')
    expect(result?.featured).toBe(true)
  })
})

describe('createArtist', () => {
  it('returns the created Artist', async () => {
    const db = makeMockDb(mockArtistRow)
    const result = await createArtist(db, {
      name: 'C Z A R I N A',
      slug: 'czarina',
    })
    expect(result.id).toBe('abc-123')
    expect(result.name).toBe('C Z A R I N A')
  })

  it('throws when error is returned', async () => {
    const db = makeMockDb(null, { message: 'Unique constraint violation', code: '23505' })
    await expect(createArtist(db, { name: 'Test', slug: 'test' })).rejects.toThrow(
      'Unique constraint violation',
    )
  })

  it('throws when no data is returned', async () => {
    const db = makeMockDb(null)
    await expect(createArtist(db, { name: 'Test', slug: 'test' })).rejects.toThrow(
      'No data returned from createArtist',
    )
  })
})

describe('updateArtist', () => {
  it('returns the updated Artist', async () => {
    const updated = { ...mockArtistRow, name: 'Updated Name' }
    const db = makeMockDb(updated)
    const result = await updateArtist(db, mockArtistRow.id, { name: 'Updated Name' })
    expect(result.name).toBe('Updated Name')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Update failed', code: 'PGRST001' })
    await expect(updateArtist(db, 'some-id', { name: 'X' })).rejects.toThrow('Update failed')
  })
})

describe('deleteArtist', () => {
  it('resolves without error on success', async () => {
    const db = makeMockDb(null, null)
    await expect(deleteArtist(db, 'abc-123')).resolves.toBeUndefined()
  })

  it('throws when deletion fails', async () => {
    const db = makeMockDb(null, { message: 'Delete denied', code: 'PGRST301' })
    await expect(deleteArtist(db, 'abc-123')).rejects.toThrow('Delete denied')
  })
})
