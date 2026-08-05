/**
 * src/lib/api/portalFeedback.ts
 *
 * Data Access Layer for the `portal_feedback` table.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>
type FeedbackRow = Database['public']['Tables']['portal_feedback']['Row']
type FeedbackInsert = Database['public']['Tables']['portal_feedback']['Insert']

export const PORTAL_FEEDBACK_CATEGORIES = [
  'bug',
  'feature',
  'ux',
  'general',
  'praise',
] as const

export type PortalFeedbackCategory = (typeof PORTAL_FEEDBACK_CATEGORIES)[number]

export const PORTAL_FEEDBACK_STATUSES = ['new', 'reviewed', 'archived'] as const

export type PortalFeedbackStatus = (typeof PORTAL_FEEDBACK_STATUSES)[number]

/** Shared validation limits (API + UI SSOT). */
export const PORTAL_FEEDBACK_SUBJECT_MAX = 120
export const PORTAL_FEEDBACK_MESSAGE_MIN = 20
export const PORTAL_FEEDBACK_MESSAGE_MAX = 4000
export const PORTAL_FEEDBACK_RATE_MAX = 10
export const PORTAL_FEEDBACK_RATE_WINDOW_MS = 60 * 60 * 1000

export interface PortalFeedback {
  id: string
  artistId: string
  userId: string
  category: PortalFeedbackCategory
  rating: number | undefined
  subject: string | undefined
  message: string
  status: PortalFeedbackStatus
  createdAt: string
  updatedAt: string
}

export interface PortalFeedbackAdminItem extends PortalFeedback {
  artistName: string
}

export function rowToPortalFeedback(row: FeedbackRow): PortalFeedback {
  return {
    id: row.id,
    artistId: row.artist_id,
    userId: row.user_id,
    category: row.category,
    rating: row.rating ?? undefined,
    subject: row.subject ?? undefined,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Sanitize free-text for PostgREST `or` / `ilike` filters.
 * Strips operators that break filter syntax; escapes LIKE wildcards.
 */
export function sanitizeFeedbackSearch(raw: string): string {
  return raw
    .trim()
    .replace(/[,()]/g, ' ')
    .replace(/[%_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export async function createPortalFeedback(
  db: DbClient,
  data: FeedbackInsert,
): Promise<PortalFeedback> {
  const { data: row, error } = await db
    .from('portal_feedback')
    .insert(data)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('No data returned from createPortalFeedback')
  return rowToPortalFeedback(row)
}

export async function listPortalFeedbackByArtist(
  db: DbClient,
  artistId: string,
  options: { limit?: number } = {},
): Promise<PortalFeedback[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const { data, error } = await db
    .from('portal_feedback')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map(rowToPortalFeedback)
}

export interface ListPortalFeedbackAdminOptions {
  status?: PortalFeedbackStatus
  category?: PortalFeedbackCategory
  search?: string
  limit?: number
  offset?: number
}

type AdminJoinRow = FeedbackRow & {
  artists: { name: string } | null
}

export async function listPortalFeedbackAdmin(
  db: DbClient,
  options: ListPortalFeedbackAdminOptions = {},
): Promise<{ items: PortalFeedbackAdminItem[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  // Left join artists — never drop feedback if artist row is missing/unreadable
  let query = db
    .from('portal_feedback')
    .select('*, artists(name)', { count: 'exact' })

  if (options.status) {
    query = query.eq('status', options.status)
  }
  if (options.category) {
    query = query.eq('category', options.category)
  }

  const search = options.search ? sanitizeFeedbackSearch(options.search) : ''
  if (search.length > 0) {
    query = query.or(`subject.ilike.%${search}%,message.ilike.%${search}%`)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)

  const items = ((data ?? []) as AdminJoinRow[]).map((row) => ({
    ...rowToPortalFeedback(row),
    artistName: row.artists?.name?.trim() || 'Unknown artist',
  }))

  return { items, total: count ?? items.length }
}

export async function updatePortalFeedbackStatus(
  db: DbClient,
  id: string,
  status: PortalFeedbackStatus,
): Promise<PortalFeedback> {
  const { data: row, error } = await db
    .from('portal_feedback')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('Feedback not found')
  return rowToPortalFeedback(row)
}

export async function countPortalFeedbackByStatus(
  db: DbClient,
  status: PortalFeedbackStatus,
): Promise<number> {
  const { count, error } = await db
    .from('portal_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)
  if (error) throw new Error(error.message)
  return count ?? 0
}
