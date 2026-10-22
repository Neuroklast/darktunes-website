import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const createServerSupabaseClientMock = vi.fn()
const getUserRoleWithClientMock = vi.fn()
const getAdminDashboardDataMock = vi.fn()

const adminOverviewSpy = vi.fn(
  ({
    counts,
    isEditor,
  }: {
    counts: { artists: number; releases: number; news: number; videos: number }
    isEditor: boolean
  }) => <div data-testid="counts">{JSON.stringify({ ...counts, isEditor })}</div>,
)

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/components/admin/AdminOverview', () => ({
  AdminOverview: adminOverviewSpy,
}))

vi.mock('@/lib/getUserRole', () => ({
  getUserRoleWithClient: getUserRoleWithClientMock,
}))

vi.mock('@/lib/api/adminDashboard', () => ({
  getAdminDashboardData: getAdminDashboardDataMock,
}))

function createCountQuery(count: number) {
  return {
    select: vi.fn().mockResolvedValue({ count, error: null }),
  }
}

function session() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
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
  }
}

describe('app/admin/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserRoleWithClientMock.mockResolvedValue('admin')
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
    expect(getAdminDashboardDataMock).toHaveBeenCalledWith(expect.anything(), { isAdmin: true })
    expect(screen.getByTestId('counts')).toHaveTextContent(
      JSON.stringify({
        artists: 12,
        releases: 7,
        news: 5,
        videos: 9,
        isEditor: false,
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
      }),
    )
  })

  it('marks editors and skips staff-only dashboard queues', async () => {
    getUserRoleWithClientMock.mockResolvedValue('editor')
    createServerSupabaseClientMock.mockResolvedValue({
      ...session(),
      from: vi.fn(() => createCountQuery(3)),
    })

    const { default: AdminPage } = await import('../../../app/admin/page')

    render(await AdminPage())

    expect(getAdminDashboardDataMock).toHaveBeenCalledWith(expect.anything(), { isAdmin: false })
    expect(screen.getByTestId('counts')).toHaveTextContent('"isEditor":true')
  })
})
