import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPressOnlyNewsPosts, getPressReleaseBySlug } from './pressReleases'

type DbClient = SupabaseClient<Database>
type NewsRow = Database['public']['Tables']['news_posts']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
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

const mockRow: NewsRow = {
  id: 'press-1',
  organization_id: '00000000-0000-0000-0000-000000000000',
  title: 'New Signing',
  slug: 'new-signing',
  excerpt: 'Excerpt',
  content: 'Body',
  image_url: null,
  featured: false,
  featured_until: null,
  featured_removed_reason: null,
  is_press_only: true,
  status: 'published',
  published_at: '2024-06-01T00:00:00Z',
  created_at: '2024-06-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
  artist_id: null,
  reviewed_by: null,
  embargo_until: null,
  media_contact: 'press@darktunes.com',
  release_category: 'label news',
  hero_primary_btn_label: null,
  hero_primary_btn_action: null,
  hero_primary_btn_href: null,
  hero_secondary_btn_label: null,
  hero_secondary_btn_action: null,
  hero_secondary_btn_href: null,
  hero_bg_url: null,
  published_at_timezone: null,
}

describe('pressReleases DAL', () => {
  it('returns embargo-aware press posts', async () => {
    const db = makeMockDb([mockRow])
    const result = await getPressOnlyNewsPosts(db)
    expect(result).toHaveLength(1)
    expect(result[0].mediaContact).toBe('press@darktunes.com')
    expect(result[0].releaseCategory).toBe('label news')
  })

  it('returns a press release by slug', async () => {
    const db = makeMockDb(mockRow)
    const result = await getPressReleaseBySlug(db, 'new-signing')
    expect(result?.slug).toBe('new-signing')
  })

  it('returns null on not found', async () => {
    const db = makeMockDb(null, { message: 'Not found', code: 'PGRST116' })
    const result = await getPressReleaseBySlug(db, 'missing')
    expect(result).toBeNull()
  })
})
