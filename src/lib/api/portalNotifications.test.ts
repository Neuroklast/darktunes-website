import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPortalNotificationFeed,
  markAllPortalMessagesRead,
} from './portalNotifications'

const upsertMessageReceiptsMock = vi.fn()
const listReadMessageIdsMock = vi.fn()

vi.mock('@/lib/messaging/receipts', () => ({
  listReadMessageIds: (...args: unknown[]) => listReadMessageIdsMock(...args),
  upsertMessageReceipts: (...args: unknown[]) => upsertMessageReceiptsMock(...args),
  upsertMessageReceipt: vi.fn(),
}))

vi.mock('@/lib/api/labelMessages', () => ({
  markMessageRead: vi.fn(),
}))

vi.mock('@/lib/api/portalMessages', () => ({
  markPortalMessageRead: vi.fn(),
}))

vi.mock('@/lib/api/notifications', () => ({
  markNotificationRead: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  getNotificationHref: () => '/portal',
}))

function chainResult(data: unknown, error: unknown = null) {
  const result = { data, error }
  const chain: Record<string, unknown> = {}
  const self = () => chain
  chain.select = self
  chain.eq = self
  chain.is = self
  chain.order = self
  chain.limit = self
  chain.update = self
  // terminal
  chain.then = undefined
  // Make thenable for await
  Object.assign(chain, {
    then(onFulfilled: (v: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled)
    },
  })
  return chain
}

describe('portalNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listReadMessageIdsMock.mockResolvedValue(new Set<string>())
    upsertMessageReceiptsMock.mockResolvedValue(undefined)
  })

  it('markAllPortalMessagesRead writes receipts when userId is provided', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'label_messages') {
        // select ids vs update — both use from('label_messages')
        // First calls are select, later update; use call count loosely
        return chainResult([{ id: 'lm-1' }, { id: 'lm-2' }])
      }
      if (table === 'portal_messages') {
        return chainResult([{ id: 'pm-1' }])
      }
      if (table === 'notifications') {
        return chainResult(null)
      }
      return chainResult(null)
    })

    const db = { from } as never
    await markAllPortalMessagesRead(db, 'artist-1', 'user-1')

    expect(upsertMessageReceiptsMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        source: 'label',
        userId: 'user-1',
        messageIds: expect.arrayContaining(['lm-1', 'lm-2']),
      }),
    )
    expect(upsertMessageReceiptsMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        source: 'portal',
        userId: 'user-1',
        messageIds: expect.arrayContaining(['pm-1']),
      }),
    )
  })

  it('markAllPortalMessagesRead skips receipts without userId', async () => {
    const from = vi.fn(() => chainResult([]))
    await markAllPortalMessagesRead({ from } as never, 'artist-1', null)
    expect(upsertMessageReceiptsMock).not.toHaveBeenCalled()
  })

  it('getPortalNotificationFeed uses receipts for unread when userId set', async () => {
    listReadMessageIdsMock.mockImplementation(
      async (
        _db: unknown,
        opts: { source: string; messageIds: string[] },
      ) => {
        if (opts.source === 'label') return new Set(['lm-read'])
        return new Set<string>()
      },
    )

    const from = vi.fn((table: string) => {
      if (table === 'label_messages') {
        return chainResult([
          { id: 'lm-read', subject: 'Read', sent_at: '2025-01-02T00:00:00Z', read: false },
          { id: 'lm-unread', subject: 'Unread', sent_at: '2025-01-03T00:00:00Z', read: true },
        ])
      }
      if (table === 'portal_messages') return chainResult([])
      if (table === 'interview_requests') return chainResult([])
      if (table === 'sales_statements') return chainResult([])
      if (table === 'notifications') return chainResult([])
      return chainResult([])
    })

    const feed = await getPortalNotificationFeed(
      { from } as never,
      'artist-1',
      20,
      'user-1',
    )

    const readItem = feed.find((i) => i.id === 'lm-read')
    const unreadItem = feed.find((i) => i.id === 'lm-unread')
    expect(readItem?.isUnread).toBe(false)
    expect(unreadItem?.isUnread).toBe(true)
  })
})
