import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getVideoSubmissionsByArtistId,
  getAllVideoSubmissions,
  createVideoSubmission,
  updateVideoSubmissionStatus,
} from './videoSubmissions'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const row = {
  id: 'vid-1',
  artist_id: 'artist-1',
  status: 'received' as const,
  title: 'My Video',
  description: 'A music video',
  download_url: 'https://drive.google.com/file/video',
  thumbnail_url: null,
  youtube_title: 'My Video — Official',
  youtube_description: 'Watch now',
  youtube_tags: ['techno', 'darkTunes'],
  youtube_category: 'Music',
  target_publish_date: '2026-08-01',
  notes: null,
  form_data: null,
  admin_reply: null,
  admin_reply_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('videoSubmissions DAL', () => {
  it('getVideoSubmissionsByArtistId returns mapped submissions', async () => {
    const db = makeMockDb([row])
    const items = await getVideoSubmissionsByArtistId(db, 'artist-1')
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('vid-1')
    expect(items[0].artistId).toBe('artist-1')
    expect(items[0].downloadUrl).toBe('https://drive.google.com/file/video')
    expect(items[0].youtubeTags).toEqual(['techno', 'darkTunes'])
  })

  it('getVideoSubmissionsByArtistId returns empty array on null data', async () => {
    const db = makeMockDb(null)
    const items = await getVideoSubmissionsByArtistId(db, 'artist-1')
    expect(items).toHaveLength(0)
  })

  it('getVideoSubmissionsByArtistId throws on error', async () => {
    const db = makeMockDb(null, { message: 'DB error' })
    await expect(getVideoSubmissionsByArtistId(db, 'artist-1')).rejects.toThrow('DB error')
  })

  it('getAllVideoSubmissions returns all submissions', async () => {
    const db = makeMockDb([row])
    const items = await getAllVideoSubmissions(db)
    expect(items).toHaveLength(1)
    expect(items[0].youtubeTitle).toBe('My Video — Official')
  })

  it('createVideoSubmission returns the created submission', async () => {
    const db = makeMockDb(row)
    const result = await createVideoSubmission(db, {
      artist_id: 'artist-1',
      title: 'My Video',
      download_url: 'https://drive.google.com/file/video',
    })
    expect(result.id).toBe('vid-1')
    expect(result.status).toBe('received')
  })

  it('createVideoSubmission throws when no data returned', async () => {
    const db = makeMockDb(null)
    await expect(
      createVideoSubmission(db, {
        artist_id: 'artist-1',
        title: 'My Video',
        download_url: 'https://example.com/v',
      }),
    ).rejects.toThrow('No data returned')
  })

  it('updateVideoSubmissionStatus updates status without reply', async () => {
    const updated = { ...row, status: 'reviewed' as const }
    const db = makeMockDb(updated)
    const result = await updateVideoSubmissionStatus(db, 'vid-1', 'reviewed')
    expect(result.status).toBe('reviewed')
    expect(result.adminReply).toBeNull()
  })

  it('updateVideoSubmissionStatus includes reply when provided', async () => {
    const updated = { ...row, status: 'rejected' as const, admin_reply: 'Low resolution' }
    const db = makeMockDb(updated)
    const result = await updateVideoSubmissionStatus(db, 'vid-1', 'rejected', 'Low resolution')
    expect(result.status).toBe('rejected')
    expect(result.adminReply).toBe('Low resolution')
  })
})
