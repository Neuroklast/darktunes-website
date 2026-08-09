import { describe, expect, it, vi } from 'vitest'
import {
  getIncomingToLabelMessages,
  getIncomingToLabelUnreadCount,
  getSentToLabelMessages,
} from './portalMessages'

function createMockDb(rows: Record<string, unknown>[] = [], count = rows.length) {
  const listChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }

  const countResult = { count, error: null }
  const countChain: {
    eq: ReturnType<typeof vi.fn>
    is: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    then: (resolve: (value: typeof countResult) => void) => Promise<typeof countResult>
  } = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    then: (resolve) => {
      resolve(countResult)
      return Promise.resolve(countResult)
    },
  }
  countChain.eq.mockReturnValue(countChain)
  countChain.is.mockReturnValue(countChain)
  countChain.in.mockReturnValue(countChain)

  const artistChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: [{ id: 'artist-1' }], error: null }),
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'artists') return artistChain
      if (table === 'portal_messages') {
        return {
          select: vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) return countChain
            return listChain
          }),
        }
      }
      return listChain
    }),
  } as never
}

describe('portalMessages admin inbox helpers', () => {
  it('loads incoming artist-to-label messages', async () => {
    const row = {
      id: 'msg-1',
      from_artist_id: 'artist-1',
      to_artist_id: null,
      to_label: true,
      subject: 'Hello label',
      body: 'Body',
      body_html: null,
      sent_at: '2026-01-01T00:00:00Z',
      read_at: null,
      starred: false,
      deleted_at: null,
      folder_id: null,
      has_attachments: false,
    }

    const db = createMockDb([row])
    const messages = await getIncomingToLabelMessages(db)

    expect(messages).toHaveLength(1)
    expect(messages[0]?.toLabel).toBe(true)
    expect(messages[0]?.fromArtistId).toBe('artist-1')
  })

  it('counts unread artist-to-label messages', async () => {
    const db = createMockDb([], 3)
    const unread = await getIncomingToLabelUnreadCount(db)
    expect(unread).toBe(3)
  })

  it('loads sent-to-label messages for an artist', async () => {
    const row = {
      id: 'msg-2',
      from_artist_id: 'artist-1',
      to_artist_id: null,
      to_label: true,
      subject: 'Sent',
      body: 'Body',
      body_html: null,
      sent_at: '2026-01-02T00:00:00Z',
      read_at: null,
      starred: false,
      deleted_at: null,
      folder_id: null,
      has_attachments: false,
    }

    const db = createMockDb([row])
    const messages = await getSentToLabelMessages(db, 'artist-1')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.fromArtistId).toBe('artist-1')
  })
})
