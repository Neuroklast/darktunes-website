import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getIncomingToLabelUnreadCount } from '@/lib/api/portalMessages'

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

export type AdminDashboardSection =
  | 'releaseSubmissions'
  | 'videoSubmissions'
  | 'fanPageReviews'
  | 'unreadMessages'
  | 'statementsToReview'
  | 'overdueInvoices'
  | 'recentErrors'
  | 'activity'

export interface AdminActivityItem {
  id: string
  kind: AdminActivityKind
  title: string
  at: string
}

export interface AdminDashboardData {
  counts: AdminDashboardCounts
  activity: AdminActivityItem[]
  /** Parts that could not be read. Their counts are 0, not a confirmed zero. */
  failures: AdminDashboardSection[]
}

const ISO_DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_TIME_ZONE = 'Europe/Berlin'

function logReadFailure(section: AdminDashboardSection, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[admin-dashboard] ${section} read failed: ${message}`)
}

async function safeCount(
  section: AdminDashboardSection,
  query: PromiseLike<{ count: number | null; error: unknown }>,
  failures: AdminDashboardSection[],
): Promise<number> {
  try {
    const { count, error } = await query
    if (error) {
      failures.push(section)
      logReadFailure(section, error)
      return 0
    }
    return count ?? 0
  } catch (error) {
    failures.push(section)
    logReadFailure(section, error)
    return 0
  }
}

async function safeCountFn(
  section: AdminDashboardSection,
  run: () => Promise<number>,
  failures: AdminDashboardSection[],
): Promise<number> {
  try {
    return await run()
  } catch (error) {
    failures.push(section)
    logReadFailure(section, error)
    return 0
  }
}

async function safeRows(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  failures: AdminDashboardSection[],
): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await query
    if (error) {
      failures.push('activity')
      logReadFailure('activity', error)
      return []
    }
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  } catch (error) {
    failures.push('activity')
    logReadFailure('activity', error)
    return []
  }
}

/** Date key (`YYYY-MM-DD`) in the operator's time zone, for DATE comparisons. */
export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/**
 * Real work queues for the admin landing page.
 *
 * Staff-only queues (finance, technical health) are queried only when
 * `isAdmin` is true. A failed query is reported in `failures`; the UI must not
 * present its `0` as a confirmed empty queue. The caller must still authorize
 * the request on the server.
 */
export async function getAdminDashboardData(
  db: DbClient,
  options: { isAdmin: boolean; now?: Date; timeZone?: string },
): Promise<AdminDashboardData> {
  const now = options.now ?? new Date()
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE
  const today = dateKeyInTimeZone(now, timeZone)
  const since = new Date(now.getTime() - ISO_DAY_MS).toISOString()
  const failures: AdminDashboardSection[] = []

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
      'releaseSubmissions',
      db
        .from('release_submissions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['received', 'reviewed']),
      failures,
    ),
    safeCount(
      'videoSubmissions',
      db
        .from('video_submissions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['received', 'reviewed']),
      failures,
    ),
    safeCount(
      'fanPageReviews',
      db
        .from('artist_landing_pages')
        .select('id', { count: 'exact', head: true })
        .eq('publish_status', 'pending_review'),
      failures,
    ),
    options.isAdmin
      ? safeCountFn('unreadMessages', () => getIncomingToLabelUnreadCount(db), failures)
      : 0,
    options.isAdmin
      ? safeCount(
          'statementsToReview',
          db
            .from('sales_statements')
            .select('id', { count: 'exact', head: true })
            .in('status', ['draft', 'label_approved']),
          failures,
        )
      : 0,
    options.isAdmin
      ? safeCount(
          'overdueInvoices',
          db
            .from('artist_invoices')
            .select('id', { count: 'exact', head: true })
            .in('status', ['sent', 'partially_paid'])
            .lt('due_date', today),
          failures,
        )
      : 0,
    options.isAdmin
      ? safeCount(
          'recentErrors',
          db
            .from('app_logs')
            .select('id', { count: 'exact', head: true })
            .eq('level', 'error')
            .eq('resolved', false)
            .eq('ignored', false)
            .gte('last_seen_at', since),
          failures,
        )
      : 0,
  ])

  const activity = await loadRecentActivity(db, options.isAdmin, failures)

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
    failures: [...new Set(failures)],
  }
}

async function loadRecentActivity(
  db: DbClient,
  isAdmin: boolean,
  failures: AdminDashboardSection[],
): Promise<AdminActivityItem[]> {
  const [releases, videos, messages, fanPages, news] = await Promise.all([
    safeRows(
      db
        .from('release_submissions')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(3),
      failures,
    ),
    safeRows(
      db
        .from('video_submissions')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(2),
      failures,
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
          failures,
        )
      : ([] as Record<string, unknown>[]),
    safeRows(
      db
        .from('artist_landing_pages')
        .select('id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(2),
      failures,
    ),
    isAdmin
      ? safeRows(
          db
            .from('news_posts')
            .select('id, title, updated_at')
            .order('updated_at', { ascending: false })
            .limit(2),
          failures,
        )
      : ([] as Record<string, unknown>[]),
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
