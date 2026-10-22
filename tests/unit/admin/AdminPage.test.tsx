import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const createServerSupabaseClientMock = vi.fn()
const resolveEffectiveAccessMock = vi.fn()
const getAdminDashboardDataMock = vi.fn()
const redirectMock = vi.fn(() => {
  throw new Error('NEXT_REDIRECT')
})

const adminOverviewSpy = vi.fn(
  ({
    counts,
    isEditor,
    metricsError,
  }: {
    counts: { artists: number; releases: number; news: number; videos: number }
    isEditor: boolean
    metricsError: boolean
  }) => <div data-testid="counts">{JSON.stringify({ ...counts, isEditor, metricsError })}</div>,
)

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('@/components/admin/AdminOverview', () => ({
  AdminOverview: adminOverviewSpy,
}))

vi.mock('@/lib/rbac/resolveAccess', () => ({
  resolveEffectiveAccess: resolveEffectiveAccessMock,
}))

vi.mock('@/lib/cache/publicQueries', () => ({
  getCachedSiteSettings: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/api/adminDashboard', () => ({
  getAdminDashboardData: getAdminDashboardDataMock,
}))

function createCountQuery(count: number, error: unknown = null) {
  return {
    select: vi.fn().mockResolvedValue({ count, error }),
  }
}

function session() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }
}

function access(overrides: Record<string, unknown> = {}) {
  return {
    primaryRole: 'admin',
    allRoles: ['admin'],
    permissions: new Set<string>(),
    capabilities: new Set<string>(['admin.panel.full', 'admin.panel.editor']),
    customRoleNames: [],
    isAdmin: true,
    ...overrides,
  }
}

function emptyDashboard() {
  return {
    counts: {
      releaseSubmissions: 0,
      videoSubmissions: 0,
      fanPageReviews: 0,
      unreadMessages: 0,
      statementsToReview: 0,
      overdueInvoices: 0,
      recentErrors: 0,
    },
    activity: [],
    failures: [],
  }
}

describe('app/admin/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveEffectiveAccessMock.mockResolvedValue(access())
    getAdminDashboardDataMock.mockResolvedValue(emptyDashboard())
  })

  it('loads admin overview counts on the server and passes them to AdminOverview', async () => {
    const artistsQuery = createCountQuery(12)
    const releasesQuery = createCountQuery(7)
    const newsQuery = createCountQuery(5)
    const videosQuery = createCountQuery(9)

    const fromMock = vi.fn((table: string) => {
      switch (table) {
        case 'artists':
          return artistsQuery
        case 'releases':
          return releasesQuery
        case 'news_posts':
          return newsQuery
        case 'videos':
          return videosQuery
        default:
          throw new Error(`Unexpected table: ${table}`)
      }
    })

    createServerSupabaseClientMock.mockResolvedValue({
      ...session(),
      from: fromMock,
    })

    const { default: AdminPage, dynamic } = await import('../../../app/admin/page')

    expect(dynamic).toBe('force-dynamic')

    render(await AdminPage())

    expect(createServerSupabaseClientMock).toHaveBeenCalledTimes(1)
    expect(fromMock).toHaveBeenNthCalledWith(1, 'artists')
    expect(fromMock).toHaveBeenNthCalledWith(2, 'releases')
    expect(fromMock).toHaveBeenNthCalledWith(3, 'news_posts')
    expect(fromMock).toHaveBeenNthCalledWith(4, 'videos')
    expect(artistsQuery.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(releasesQuery.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(newsQuery.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(videosQuery.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(getAdminDashboardDataMock).toHaveBeenCalledWith(expect.anything(), {
      isAdmin: true,
      timeZone: 'Europe/Berlin',
    })
    expect(screen.getByTestId('counts')).toHaveTextContent(
      JSON.stringify({
        artists: 12,
        releases: 7,
        news: 5,
        videos: 9,
        isEditor: false,
        metricsError: false,
      }),
    )
  })

  it('falls back to zero when a head count is null', async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      ...session(),
      from: vi.fn((table: string) => ({
        select: vi.fn().mockResolvedValue({
          count: table === 'artists' ? null : 1,
          error: null,
        }),
      })),
    })

    const { default: AdminPage } = await import('../../../app/admin/page')

    render(await AdminPage())

    expect(screen.getByTestId('counts')).toHaveTextContent(
      JSON.stringify({
        artists: 0,
        releases: 1,
        news: 1,
        videos: 1,
        isEditor: false,
        metricsError: false,
      }),
    )
  })

  it('flags a failed metric query instead of showing a false zero', async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      ...session(),
      from: vi.fn(() => createCountQuery(0, { message: 'denied' })),
    })

    const { default: AdminPage } = await import('../../../app/admin/page')

    render(await AdminPage())

    expect(screen.getByTestId('counts')).toHaveTextContent('"metricsError":true')
  })

  it('marks editors and skips staff-only dashboard queues', async () => {
    resolveEffectiveAccessMock.mockResolvedValue(
      access({
        primaryRole: 'editor',
        allRoles: ['editor'],
        isAdmin: false,
        capabilities: new Set<string>(['admin.panel.editor']),
      }),
    )
    createServerSupabaseClientMock.mockResolvedValue({
      ...session(),
      from: vi.fn(() => createCountQuery(3)),
    })

    const { default: AdminPage } = await import('../../../app/admin/page')

    render(await AdminPage())

    expect(getAdminDashboardDataMock).toHaveBeenCalledWith(expect.anything(), {
      isAdmin: false,
      timeZone: 'Europe/Berlin',
    })
    expect(screen.getByTestId('counts')).toHaveTextContent('"isEditor":true')
  })

  it('redirects users without admin panel access', async () => {
    resolveEffectiveAccessMock.mockResolvedValue(
      access({ isAdmin: false, capabilities: new Set<string>() }),
    )
    createServerSupabaseClientMock.mockResolvedValue({
      ...session(),
      from: vi.fn(() => createCountQuery(0)),
    })

    const { default: AdminPage } = await import('../../../app/admin/page')

    await expect(AdminPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith('/login?error=unauthorized')
  })
})
