import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { dateKeyInTimeZone, getAdminDashboardData } from '@/lib/api/adminDashboard'

type QueryResult = { count?: number | null; data?: unknown; error?: unknown }
type Call = [string, ...unknown[]]

function makeDb(handlers: Record<string, QueryResult>) {
  const chains: Record<string, { calls: Call[] }> = {}
  const db = {
    from(table: string) {
      const calls = chains[table]?.calls ?? []
      chains[table] = { calls }
      const result: QueryResult = handlers[table] ?? { count: 0, data: [] }
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'is', 'lt', 'gte', 'order', 'limit']) {
        chain[method] = (...args: unknown[]) => {
          calls.push([method, ...args])
          return chain
        }
      }
      chain.then = (resolve: (value: QueryResult) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return chain
    },
  }
  return { db: db as unknown as SupabaseClient<Database>, chains }
}

const adminOptions = { isAdmin: true, timeZone: 'Europe/Berlin' }

describe('getAdminDashboardData', () => {
  it('counts received and reviewed submissions as open work', async () => {
    const { db, chains } = makeDb({
      release_submissions: { count: 4, error: null, data: [] },
      video_submissions: { count: 1, error: null, data: [] },
    })

    const data = await getAdminDashboardData(db, adminOptions)

    expect(data.counts.releaseSubmissions).toBe(4)
    expect(chains.release_submissions.calls).toContainEqual(['in', 'status', ['received', 'reviewed']])
    expect(chains.video_submissions.calls).toContainEqual(['in', 'status', ['received', 'reviewed']])
  })

  it('excludes ignored errors from the system notice count', async () => {
    const { db, chains } = makeDb({ app_logs: { count: 0, error: null } })

    await getAdminDashboardData(db, adminOptions)

    expect(chains.app_logs.calls).toContainEqual(['eq', 'ignored', false])
  })

  it('uses the operator time zone for the overdue cutoff', async () => {
    const { db, chains } = makeDb({ artist_invoices: { count: 1, error: null } })
    const now = new Date('2026-10-22T22:30:00Z')

    await getAdminDashboardData(db, { ...adminOptions, now })

    expect(dateKeyInTimeZone(now, 'Europe/Berlin')).toBe('2026-10-23')
    expect(chains.artist_invoices.calls).toContainEqual(['lt', 'due_date', '2026-10-23'])
  })

  it('reports a failed queue instead of a confirmed zero', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = makeDb({
      release_submissions: { count: null, error: { message: 'timeout' } },
    })

    const data = await getAdminDashboardData(db, adminOptions)

    expect(data.counts.releaseSubmissions).toBe(0)
    expect(data.failures).toContain('releaseSubmissions')
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('reports a failed activity read', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db } = makeDb({
      news_posts: { data: null, error: { message: 'denied' } },
    })

    const data = await getAdminDashboardData(db, adminOptions)

    expect(data.failures).toContain('activity')
    errorSpy.mockRestore()
  })
})
