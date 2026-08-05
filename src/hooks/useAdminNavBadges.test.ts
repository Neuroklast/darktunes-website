import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAdminNavBadges } from './useAdminNavBadges'

const { getIncomingToLabelUnreadCount, safeCount } = vi.hoisted(() => ({
  getIncomingToLabelUnreadCount: vi.fn(),
  safeCount: vi.fn(),
}))

vi.mock('@/lib/api/portalMessages', () => ({ getIncomingToLabelUnreadCount }))
vi.mock('@/lib/api/safeCount', () => ({ safeCount }))
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({}) }) }),
    channel: () => {
      const ch: { on: () => typeof ch; subscribe: () => Record<string, never> } = { on: () => ch, subscribe: () => ({}) }
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
