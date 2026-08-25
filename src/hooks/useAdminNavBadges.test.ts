import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAdminNavBadges } from './useAdminNavBadges'

const { getIncomingToLabelUnreadCount, safeCount } = vi.hoisted(() => ({
  getIncomingToLabelUnreadCount: vi.fn(),
  safeCount: vi.fn(),
}))

/** Fluent chain that accepts any number of .eq()/.is() and is awaitable. */
function chainableQuery(result: { count: number | null; error: unknown } = { count: 0, error: null }) {
  const chain: {
    eq: () => typeof chain
    is: () => typeof chain
    then: PromiseLike<typeof result>['then']
  } = {
    eq: () => chain,
    is: () => chain,
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return chain
}

vi.mock('@/lib/api/portalMessages', () => ({ getIncomingToLabelUnreadCount }))
vi.mock('@/lib/api/safeCount', () => ({ safeCount }))
vi.mock('@/lib/organizations/clientOrganizationId', () => ({
  getClientOrganizationId: () => '00000000-0000-0000-0000-000000000000',
}))
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    from: () => ({ select: () => chainableQuery() }),
    channel: () => {
      const ch: { on: () => typeof ch; subscribe: () => Record<string, never> } = {
        on: () => ch,
        subscribe: () => ({}),
      }
      return ch
    },
    removeChannel: vi.fn(),
  }),
}))

describe('useAdminNavBadges', () => {
  it('returns zero badges when disabled', () => {
    const { result } = renderHook(() => useAdminNavBadges('user-1', false))
    expect(result.current).toEqual({
      messages: 0,
      releaseSubmissions: 0,
      videoSubmissions: 0,
      fanPageReviews: 0,
      portalFeedback: 0,
    })
  })

  it('loads all badge counters when enabled', async () => {
    getIncomingToLabelUnreadCount.mockResolvedValue(3)
    safeCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4)

    const { result } = renderHook(() => useAdminNavBadges('user-1', true))

    await waitFor(() => {
      expect(result.current).toEqual({
        messages: 3,
        releaseSubmissions: 5,
        videoSubmissions: 7,
        fanPageReviews: 2,
        portalFeedback: 4,
      })
    })
  })
})
