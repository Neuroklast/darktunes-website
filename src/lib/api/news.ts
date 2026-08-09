import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { NewsPost } from '@/types'
import { parseJunctionRows } from '@/lib/types/jsonColumns'
import { stripEmojis, stripEmojisFromHtml } from '@/lib/stripEmojis'
import { PUBLIC_QUERY_LIMITS } from './queryLimits'
import { sanitizeNewsWrite } from '@/lib/sanitizeTextContent'

type DbClient = SupabaseClient<Database>
type NewsRow = Database['public']['Tables']['news_posts']['Row']
export type NewsInsert = Database['public']['Tables']['news_posts']['Insert']
export type NewsUpdate = Database['public']['Tables']['news_posts']['Update']

export function rowToNewsPost(row: NewsRow): NewsPost {
  const r = row as NewsRow & {
    embargo_until?: string | null
    media_contact?: string | null
    release_category?: string | null
    reviewed_by?: string | null
  }
  const validStatuses = ['draft', 'published', 'scheduled', 'archived'] as const
  type NewsStatus = typeof validStatuses[number]
  const status: NewsStatus = (validStatuses as readonly string[]).includes(row.status)
    ? (row.status as NewsStatus)
    : 'draft'
  return {
    id: row.id,
    title: stripEmojis(row.title),
    slug: stripEmojis(row.slug),
    excerpt: row.excerpt ? stripEmojis(row.excerpt) : '',
    content: stripEmojisFromHtml(row.content),
    imageUrl: row.image_url ?? undefined,
    publishedAt: row.published_at,
    publishedAtTimezone: row.published_at_timezone ?? undefined,
    featured: row.featured ?? false,
    featuredUntil: row.featured_until ?? undefined,
    featuredRemovedReason: (row.featured_removed_reason as NewsPost['featuredRemovedReason']) ?? undefined,
    isPressOnly: row.is_press_only,
    artistId: row.artist_id ?? null,
    status,
    embargoUntil: r.embargo_until ?? undefined,
    mediaContact: r.media_contact ?? undefined,
    releaseCategory: r.release_category ?? undefined,
    heroBgUrl: row.hero_bg_url ?? undefined,
    heroPrimaryBtn: (row.hero_primary_btn_action || row.hero_primary_btn_label || row.hero_primary_btn_href)
      ? {
          label: row.hero_primary_btn_label ?? undefined,
          action: (row.hero_primary_btn_action as 'link' | 'scroll' | 'none') ?? undefined,
          href: row.hero_primary_btn_href ?? undefined,
        }
      : undefined,
    heroSecondaryBtn: (row.hero_secondary_btn_action || row.hero_secondary_btn_label || row.hero_secondary_btn_href)
      ? {
          label: row.hero_secondary_btn_label ?? undefined,
          action: (row.hero_secondary_btn_action as 'link' | 'scroll' | 'none') ?? undefined,
          href: row.hero_secondary_btn_href ?? undefined,
        }
      : undefined,
    reviewedBy: r.reviewed_by ?? undefined,
  }
}

/**
 * Attach the full artist list from the news_post_artists junction table.
 */
async function attachNewsArtists(db: DbClient, posts: NewsPost[]): Promise<NewsPost[]> {
  if (posts.length === 0) return posts
  const ids = posts.map((p) => p.id)

  const { data, error } = await (db as DbClient)
    .from('news_post_artists' as const)
    .select('news_post_id, sort_order, artists(id, name, slug)')
    .in('news_post_id', ids)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to load news post artists: ${error.message}`)

  const byPost = new Map<string, { id: string; name: string; slug: string }[]>()
  for (const row of parseJunctionRows(data, 'news_post_id')) {
    if (!row.artists) continue
    if (!byPost.has(row.news_post_id)) byPost.set(row.news_post_id, [])
    byPost.get(row.news_post_id)!.push(row.artists)
  }

  return posts.map((p) => ({
    ...p,
    artists: byPost.get(p.id) ?? undefined,
  }))
}

export async function getNewsPosts(db: DbClient): Promise<NewsPost[]> {
  const { data, error } = await db
    .from('news_posts')
    .select('*')
    .order('published_at', { ascending: false })
  if (error) throw new Error(error.message)
  const posts = (data ?? []).map(rowToNewsPost)
  return attachNewsArtists(db, posts)
}

/**
 * Public-facing: returns published posts and scheduled posts once their publish time is reached.
 */
/**
 * Promote due scheduled posts to published (replaces legacy pg_cron job).
 * Returns the number of rows updated.
 */
export async function publishScheduledNewsPosts(db: DbClient): Promise<number> {
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('news_posts')
    .update({ status: 'published', updated_at: now })
    .eq('status', 'scheduled')
    .lte('published_at', now)
    .select('id')

  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export async function getPublicNewsPosts(
  db: DbClient,
  organizationId: string = '00000000-0000-0000-0000-000000000000',
): Promise<NewsPost[]> {
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('news_posts')
    .select('*')
    .eq('organization_id', organizationId)
    .in('status', ['published', 'scheduled'])
    .eq('is_press_only', false)
    .lte('published_at', now)
    .order('published_at', { ascending: false })
    .limit(PUBLIC_QUERY_LIMITS.news)
  if (error) throw new Error(error.message)
  const posts = (data ?? []).map(rowToNewsPost)
  return attachNewsArtists(db, posts)
}

/**
 * Public-facing: returns published posts associated with a specific artist.
 * Checks both the legacy artist_id column and the many-to-many junction table.
 */
export async function getPublicNewsPostsByArtistId(db: DbClient, artistId: string): Promise<NewsPost[]> {
  const now = new Date().toISOString()

  // Primary query: the legacy artist_id column (preserves error behaviour for callers)
  const { data, error } = await db
    .from('news_posts')
    .select('*')
    .eq('artist_id', artistId)
    .in('status', ['published', 'scheduled'])
    .eq('is_press_only', false)
    .lte('published_at', now)
    .order('published_at', { ascending: false })
    .limit(PUBLIC_QUERY_LIMITS.newsByArtist)
  if (error) throw new Error(error.message)

  const legacyPosts = (data ?? []).map(rowToNewsPost)
  const legacyIds = new Set(legacyPosts.map((p) => p.id))

  // Secondary: also collect posts linked via the many-to-many junction table
  const { data: junctionRows } = await (db as DbClient)
    .from('news_post_artists' as const)
    .select('news_post_id')
    .eq('artist_id', artistId)

  const extraIds = ((junctionRows ?? []) as { news_post_id: string }[])
    .map((r) => r.news_post_id)
    .filter((id) => id && !legacyIds.has(id))

  if (extraIds.length > 0) {
    const { data: extra } = await db
      .from('news_posts')
      .select('*')
      .in('id', extraIds)
      .in('status', ['published', 'scheduled'])
      .eq('is_press_only', false)
      .lte('published_at', now)
      .order('published_at', { ascending: false })

    if (extra && extra.length > 0) {
      const merged = [
        ...legacyPosts,
        ...extra.map(rowToNewsPost),
      ]
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        .slice(0, PUBLIC_QUERY_LIMITS.newsByArtist)
      return attachNewsArtists(db, merged)
    }
  }

  return attachNewsArtists(db, legacyPosts)
}

export async function getPressOnlyNewsPosts(db: DbClient): Promise<NewsPost[]> {
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('news_posts')
    .select('*')
    .eq('is_press_only', true)
    .in('status', ['published', 'scheduled'])
    .lte('published_at', now)
    .or(`embargo_until.is.null,embargo_until.lte.${now}`)
    .order('published_at', { ascending: false })
    .limit(PUBLIC_QUERY_LIMITS.news)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToNewsPost)
}

export async function getPressReleaseBySlug(db: DbClient, slug: string): Promise<NewsPost | null> {
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('news_posts')
    .select('*')
    .eq('slug', slug)
    .eq('is_press_only', true)
    .in('status', ['published', 'scheduled'])
    .lte('published_at', now)
    .or(`embargo_until.is.null,embargo_until.lte.${now}`)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data ? rowToNewsPost(data) : null
}

/**
 * Public-facing: returns a single post by slug when it is visible (published or
 * scheduled once publish time is reached). Drafts, archived, and future scheduled
 * posts return null.
 */
export async function getPublicNewsPostBySlug(db: DbClient, slug: string): Promise<NewsPost | null> {
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('news_posts')
    .select('*')
    .eq('slug', slug)
    .in('status', ['published', 'scheduled'])
    .eq('is_press_only', false)
    .lte('published_at', now)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data ? rowToNewsPost(data) : null
}

/** Admin/unrestricted: returns any post by slug regardless of status or publish time. */
export async function getNewsPostBySlug(db: DbClient, slug: string): Promise<NewsPost | null> {
  const { data, error } = await db.from('news_posts').select('*').eq('slug', slug).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data ? rowToNewsPost(data) : null
}

export async function getNewsPostById(db: DbClient, id: string): Promise<NewsPost | null> {
  const { data, error } = await db.from('news_posts').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data ? rowToNewsPost(data) : null
}

export async function createNewsPost(db: DbClient, newsData: NewsInsert): Promise<NewsPost> {
  const { data, error } = await db.from('news_posts').insert(sanitizeNewsWrite(newsData)).select().single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from createNewsPost')
  return rowToNewsPost(data)
}

export async function updateNewsPost(
  db: DbClient,
  id: string,
  newsData: NewsUpdate,
): Promise<NewsPost> {
  const { data, error } = await db
    .from('news_posts')
    .update(sanitizeNewsWrite(newsData))
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No data returned from updateNewsPost')
  return rowToNewsPost(data)
}

export async function deleteNewsPost(db: DbClient, id: string): Promise<void> {
  const { error } = await db.from('news_posts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
