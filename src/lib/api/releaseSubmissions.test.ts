import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getReleaseSubmissionsByArtistId,
  getAllReleaseSubmissions,
  createReleaseSubmission,
  updateReleaseSubmissionStatus,
} from './releaseSubmissions'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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

const row = {
  id: 'sub-1',
  artist_id: 'artist-1',
  status: 'received' as const,
  title: 'My Release',
  release_date: '2026-07-01',
  type: 'single' as const,
  genre: 'techno',
  catalog_number: 'DT-001',
  isrc: null,
  label_copy: null,
  audio_download_url: 'https://drive.google.com/file/audio',
  cover_art_url: 'https://drive.google.com/file/cover',
  cover_art_verified: true,
  spotify_url: null,
  apple_music_url: null,
  youtube_url: null,
  notes: null,
  form_data: null,
  admin_reply: null,
  admin_reply_at: null,
  progress_note: null,
  release_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('releaseSubmissions DAL', () => {
  it('getReleaseSubmissionsByArtistId returns mapped submissions', async () => {
    const db = makeMockDb([row])
    const items = await getReleaseSubmissionsByArtistId(db, 'artist-1')
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('sub-1')
    expect(items[0].artistId).toBe('artist-1')
    expect(items[0].status).toBe('received')
    expect(items[0].title).toBe('My Release')
  })

  it('getReleaseSubmissionsByArtistId returns empty array on null data', async () => {
    const db = makeMockDb(null)
    const items = await getReleaseSubmissionsByArtistId(db, 'artist-1')
    expect(items).toHaveLength(0)
  })

  it('getReleaseSubmissionsByArtistId throws on error', async () => {
    const db = makeMockDb(null, { message: 'DB error' })
    await expect(getReleaseSubmissionsByArtistId(db, 'artist-1')).rejects.toThrow('DB error')
  })

  it('getAllReleaseSubmissions returns all submissions', async () => {
    const db = makeMockDb([row])
    const items = await getAllReleaseSubmissions(db)
    expect(items).toHaveLength(1)
    expect(items[0].audioDownloadUrl).toBe('https://drive.google.com/file/audio')
  })

  it('createReleaseSubmission returns the created submission', async () => {
    const db = makeMockDb(row)
    const result = await createReleaseSubmission(db, {
      artist_id: 'artist-1',
      title: 'My Release',
      audio_download_url: 'https://drive.google.com/file/audio',
      cover_art_url: 'https://drive.google.com/file/cover',
    })
    expect(result.id).toBe('sub-1')
    expect(result.coverArtVerified).toBe(true)
  })

  it('createReleaseSubmission throws when no data returned', async () => {
    const db = makeMockDb(null)
    await expect(
      createReleaseSubmission(db, {
        artist_id: 'artist-1',
        title: 'My Release',
        audio_download_url: 'https://example.com/a',
        cover_art_url: 'https://example.com/c',
      }),
    ).rejects.toThrow('No data returned')
  })

  it('updateReleaseSubmissionStatus updates status without reply', async () => {
    const updated = { ...row, status: 'reviewed' as const }
    const db = makeMockDb(updated)
    const result = await updateReleaseSubmissionStatus(db, 'sub-1', 'reviewed')
    expect(result.status).toBe('reviewed')
    expect(result.adminReply).toBeNull()
  })

  it('updateReleaseSubmissionStatus includes reply when provided', async () => {
    const updated = { ...row, status: 'accepted' as const, admin_reply: 'Great work!' }
    const db = makeMockDb(updated)
    const result = await updateReleaseSubmissionStatus(db, 'sub-1', 'accepted', 'Great work!')
    expect(result.status).toBe('accepted')
    expect(result.adminReply).toBe('Great work!')
  })
})
