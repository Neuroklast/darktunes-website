import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getNewsPosts,
  getPublicNewsPostBySlug,
  publishScheduledNewsPosts,
  createNewsPost,
  updateNewsPost,
  deleteNewsPost,
} from './news'

type DbClient = SupabaseClient<Database>
type NewsRow = Database['public']['Tables']['news_posts']['Row']

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
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
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

const mockNewsRow: NewsRow = {
  id: 'news-001',
  title: 'BLACKBOOK Returns',
  slug: 'blackbook-returns',
  excerpt: 'A haunting new single.',
  content: 'Full content here...',
  image_url: 'https://example.com/news.jpg',
  featured: false,
  featured_until: null,
  featured_removed_reason: null,
  is_press_only: false,
  status: 'published',
  published_at: '2024-04-24T00:00:00Z',
  organization_id: '00000000-0000-0000-0000-000000000000',

  created_at: '2024-04-24T00:00:00Z',
  updated_at: '2024-04-24T00:00:00Z',
  artist_id: null,
  reviewed_by: null,
  embargo_until: null,
  media_contact: null,
  release_category: null,
  hero_primary_btn_label: null,
  hero_primary_btn_action: null,
  hero_primary_btn_href: null,
  hero_secondary_btn_label: null,
  hero_secondary_btn_href: null,
  hero_secondary_btn_action: null,
  hero_bg_url: null,
  published_at_timezone: 'Europe/Berlin',
}

describe('getNewsPosts', () => {
  it('returns an empty array when there are no news posts', async () => {
    const db = makeMockDb([])
    const result = await getNewsPosts(db)
    expect(result).toEqual([])
  })

  it('maps rows to NewsPost domain objects', async () => {
    const db = makeMockDb([mockNewsRow])
    const result = await getNewsPosts(db)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('BLACKBOOK Returns')
    expect(result[0].slug).toBe('blackbook-returns')
    expect(result[0].publishedAtTimezone).toBe('Europe/Berlin')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Query failed', code: 'PGRST001' })
    await expect(getNewsPosts(db)).rejects.toThrow('Query failed')
  })
})

describe('createNewsPost', () => {
  it('returns the created NewsPost', async () => {
    const db = makeMockDb(mockNewsRow)
    const result = await createNewsPost(db, {
      title: 'BLACKBOOK Returns',
      slug: 'blackbook-returns',
      content: 'Full content...',
    })
    expect(result.id).toBe('news-001')
    expect(result.slug).toBe('blackbook-returns')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Insert error', code: '23505' })
    await expect(
      createNewsPost(db, { title: 'Test', slug: 'test', content: '...' }),
    ).rejects.toThrow('Insert error')
  })

  it('throws when no data returned', async () => {
    const db = makeMockDb(null)
    await expect(
      createNewsPost(db, { title: 'Test', slug: 'test', content: '...' }),
    ).rejects.toThrow('No data returned from createNewsPost')
  })
})

describe('updateNewsPost', () => {
  it('returns the updated NewsPost', async () => {
    const updated = { ...mockNewsRow, title: 'Updated Title' }
    const db = makeMockDb(updated)
    const result = await updateNewsPost(db, 'news-001', { title: 'Updated Title' })
    expect(result.title).toBe('Updated Title')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Update failed', code: 'PGRST001' })
    await expect(updateNewsPost(db, 'news-001', { title: 'X' })).rejects.toThrow('Update failed')
  })
})

describe('publishScheduledNewsPosts', () => {
  it('returns the number of promoted posts', async () => {
    const db = makeMockDb([{ id: 'news-001' }, { id: 'news-002' }])
    const count = await publishScheduledNewsPosts(db)
    expect(count).toBe(2)
    expect(db.from).toHaveBeenCalledWith('news_posts')
  })

  it('returns zero when nothing is due', async () => {
    const db = makeMockDb([])
    const count = await publishScheduledNewsPosts(db)
    expect(count).toBe(0)
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Update failed', code: 'PGRST001' })
    await expect(publishScheduledNewsPosts(db)).rejects.toThrow('Update failed')
  })
})

describe('getPublicNewsPostBySlug', () => {
  it('returns a visible post by slug', async () => {
    const db = makeMockDb(mockNewsRow)
    const result = await getPublicNewsPostBySlug(db, 'blackbook-returns')
    expect(result?.slug).toBe('blackbook-returns')
  })

  it('returns null when the post is not found', async () => {
    const db = makeMockDb(null, { message: 'Not found', code: 'PGRST116' })
    const result = await getPublicNewsPostBySlug(db, 'missing')
    expect(result).toBeNull()
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'Query failed', code: 'PGRST001' })
    await expect(getPublicNewsPostBySlug(db, 'blackbook-returns')).rejects.toThrow('Query failed')
  })
})

describe('deleteNewsPost', () => {
  it('resolves without error on success', async () => {
    const db = makeMockDb(null, null)
    await expect(deleteNewsPost(db, 'news-001')).resolves.toBeUndefined()
  })

  it('throws when deletion fails', async () => {
    const db = makeMockDb(null, { message: 'Delete denied', code: 'PGRST301' })
    await expect(deleteNewsPost(db, 'news-001')).rejects.toThrow('Delete denied')
  })
})
