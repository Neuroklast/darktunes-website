import { describe, expect, it } from 'vitest'
import {
  decodeConversationCursor,
  decodeMessageCursor,
  encodeConversationCursor,
  encodeMessageCursor,
} from '@/lib/api/aiConversations'

describe('ai conversation cursors', () => {
  it('round-trips a message cursor', () => {
    const cursor = { createdAt: '2026-10-20T00:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' }
    expect(decodeMessageCursor(encodeMessageCursor(cursor))).toEqual(cursor)
  })

  it('rejects a message cursor that injects query syntax', () => {
    const raw = Buffer.from(
      JSON.stringify({
        createdAt: '2026-10-20T00:00:00.000Z,id.gt.00000000-0000-0000-0000-000000000000',
        id: '11111111-1111-4111-8111-111111111111',
      }),
      'utf8',
    ).toString('base64url')
    expect(decodeMessageCursor(raw)).toBeNull()
  })

  it('rejects a message cursor with an invalid id', () => {
    const raw = Buffer.from(
      JSON.stringify({ createdAt: '2026-10-20T00:00:00.000Z', id: 'not-a-uuid' }),
      'utf8',
    ).toString('base64url')
    expect(decodeMessageCursor(raw)).toBeNull()
  })

  it('round-trips a conversation cursor', () => {
    const cursor = { updatedAt: '2026-10-20T00:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' }
    expect(decodeConversationCursor(encodeConversationCursor(cursor))).toEqual(cursor)
  })
})
