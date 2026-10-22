import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DbClient = SupabaseClient<Database>

export interface AdminDashboardCounts {
  releaseSubmissions: number
  videoSubmissions: number
  fanPageReviews: number
  unreadMessages: number
  statementsToReview: number
  overdueInvoices: number
  recentErrors: number
}

export type AdminActivityKind = 'release' | 'video' | 'message' | 'fanPage' | 'news'

export interface AdminActivityItem {
  id: string
  kind: AdminActivityKind
  title: string
  at: string
}

export interface AdminDashboardData {
  counts: AdminDashboardCounts
  activity: AdminActivityItem[]
}

const ISO_DAY_MS = 24 * 60 * 60 * 1000

async function safeCount(
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count, error } = await query
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

async function safeRows(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await query
    if (error || !Array.isArray(data)) return []
    return data as Record<string, unknown>[]
  } catch {
    return []
  }
}

/**
 * Real work queues for the admin landing page.
 *
 * Staff-only queues (finance, technical health) are queried only when
 * `isAdmin` is true. Missing rows or RLS denials become zero rather than fake
 * numbers. The caller must still authorize the request on the server.
 */
export async function getAdminDashboardData(
  db: DbClient,
  options: { isAdmin: boolean; now?: Date },
): Promise<AdminDashboardData> {
  const now = options.now ?? new Date()
  const today = now.toISOString().slice(0, 10)
  const since = new Date(now.getTime() - ISO_DAY_MS).toISOString()

  const [
    releaseSubmissions,
    videoSubmissions,
    fanPageReviews,
    unreadMessages,
    statementsToReview,
    overdueInvoices,
    recentErrors,
  ] = await Promise.all([
    safeCount(
      db
        .from('release_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'received'),
    ),
    safeCount(
      db
        .from('video_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'received'),
    ),
    safeCount(
      db
        .from('artist_landing_pages')
        .select('id', { count: 'exact', head: true })
        .eq('publish_status', 'pending_review'),
    ),
    options.isAdmin
      ? safeCount(
          db
            .from('portal_messages')
            .select('id', { count: 'exact', head: true })
            .eq('to_label', true)
            .is('read_at', null)
            .is('deleted_at', null),
        )
      : Promise.resolve(0),
    options.isAdmin
      ? safeCount(
          db
            .from('sales_statements')
            .select('id', { count: 'exact', head: true })
            .in('status', ['draft', 'label_approved']),
        )
      : Promise.resolve(0),
    options.isAdmin
      ? safeCount(
          db
            .from('artist_invoices')
            .select('id', { count: 'exact', head: true })
            .in('status', ['sent', 'partially_paid'])
            .lt('due_date', today),
        )
      : Promise.resolve(0),
    options.isAdmin
      ? safeCount(
          db
            .from('app_logs')
            .select('id', { count: 'exact', head: true })
            .eq('level', 'error')
            .eq('resolved', false)
            .gte('last_seen_at', since),
        )
      : Promise.resolve(0),
  ])

  const activity = await loadRecentActivity(db, options.isAdmin)

  return {
    counts: {
      releaseSubmissions,
      videoSubmissions,
      fanPageReviews,
      unreadMessages,
      statementsToReview,
      overdueInvoices,
      recentErrors,
    },
    activity,
  }
}

async function loadRecentActivity(db: DbClient, isAdmin: boolean): Promise<AdminActivityItem[]> {
  const [releases, videos, messages, fanPages, news] = await Promise.all([
    safeRows(
      db
        .from('release_submissions')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(3),
    ),
    safeRows(
      db
        .from('video_submissions')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(2),
    ),
    isAdmin
      ? safeRows(
          db
            .from('portal_messages')
            .select('id, subject, sent_at')
            .eq('to_label', true)
            .is('deleted_at', null)
            .order('sent_at', { ascending: false })
            .limit(3),
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    safeRows(
      db
        .from('artist_landing_pages')
        .select('id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(2),
    ),
    isAdmin
      ? safeRows(
          db
            .from('news_posts')
            .select('id, title, updated_at')
            .order('updated_at', { ascending: false })
            .limit(2),
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ])

  const items: AdminActivityItem[] = [
    ...releases.map((row) => ({
      id: String(row.id),
      kind: 'release' as const,
      title: String(row.title ?? ''),
      at: String(row.created_at ?? ''),
    })),
    ...videos.map((row) => ({
      id: String(row.id),
      kind: 'video' as const,
      title: String(row.title ?? ''),
      at: String(row.created_at ?? ''),
    })),
    ...messages.map((row) => ({
      id: String(row.id),
      kind: 'message' as const,
      title: String(row.subject ?? ''),
      at: String(row.sent_at ?? ''),
    })),
    ...fanPages.map((row) => ({
      id: String(row.id),
      kind: 'fanPage' as const,
      title: '',
      at: String(row.updated_at ?? ''),
    })),
    ...news.map((row) => ({
      id: String(row.id),
      kind: 'news' as const,
      title: String(row.title ?? ''),
      at: String(row.updated_at ?? ''),
    })),
  ]

  return items
    .filter((item) => item.at && !Number.isNaN(Date.parse(item.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 6)
}
