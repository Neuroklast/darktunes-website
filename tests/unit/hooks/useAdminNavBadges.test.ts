import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAdminNavBadges } from '@/hooks/useAdminNavBadges'

const portalMessageHandlers: Array<() => void> = []
const removeChannelMock = vi.fn()

function chainableCount(count: number) {
  const result = { count, error: null }
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

vi.mock('@/lib/organizations/clientOrganizationId', () => ({
  getClientOrganizationId: () => '00000000-0000-0000-0000-000000000000',
}))

vi.mock('@/lib/api/portalMessages', () => ({
  getIncomingToLabelUnreadCount: vi.fn().mockResolvedValue(2),
}))

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    from: () => ({
      select: () => chainableCount(0),
    }),
    channel: (name: string) => {
      const chain = {
        on: (
          _event: string,
          config: { table?: string },
          handler: () => void,
        ) => {
          if (config.table === 'portal_messages') {
            portalMessageHandlers.push(handler)
          }
          return chain
        },
        subscribe: () => chain,
      }
      void name
      return chain
    },
    removeChannel: removeChannelMock,
  }),
}))

describe('useAdminNavBadges', () => {
  beforeEach(() => {
    portalMessageHandlers.length = 0
    removeChannelMock.mockClear()
  })

  it('refreshes message count when portal_messages changes', async () => {
    const { result } = renderHook(() => useAdminNavBadges('user-1', true))

    await waitFor(() => {
      expect(result.current.messages).toBe(2)
    })

    expect(portalMessageHandlers.length).toBeGreaterThan(0)

    portalMessageHandlers[0]?.()

    await waitFor(() => {
      expect(result.current.messages).toBe(2)
    })
  })
})
