import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireAdminOrEditorFromRequest = vi.fn()
const createServiceRoleSupabaseClient = vi.fn()
const sendLabelMessagesToArtists = vi.fn()
const emitNotification = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminOrEditorFromRequest: (...args: unknown[]) =>
    requireAdminOrEditorFromRequest(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: () => createServiceRoleSupabaseClient(),
}))

vi.mock('@/lib/messaging/send', () => ({
  sendLabelMessagesToArtists: (...args: unknown[]) => sendLabelMessagesToArtists(...args),
}))

vi.mock('@/lib/notifications', () => ({
  emitNotification: (...args: unknown[]) => emitNotification(...args),
}))

describe('POST /api/admin/messages/send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminOrEditorFromRequest.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
    createServiceRoleSupabaseClient.mockResolvedValue({ kind: 'service' })
    sendLabelMessagesToArtists.mockResolvedValue([
      {
        id: 'msg-1',
        artistId: 'artist-1',
        subject: 'Hello',
        body: 'Body',
        bodyHtml: null,
        read: false,
        readAt: null,
        starred: false,
        deletedAt: null,
        sentAt: new Date().toISOString(),
        folderId: null,
        senderEmail: null,
        isExternal: false,
        forwardedFrom: null,
        hasAttachments: false,
      },
    ])
    emitNotification.mockResolvedValue({ inserted: 1, userIds: ['u1'], skippedByPreference: 0 })
  })

  it('sends messages and emits label_message notifications', async () => {
    const { POST } = await import('../../../app/api/admin/messages/send/route')
    const req = new NextRequest('http://localhost/api/admin/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      body: JSON.stringify({
        artistIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
        subject: 'Hello',
        body: 'Body text',
      }),
    })
    const res = await POST(req)
    const payload = await res.json()
    expect(res.status, JSON.stringify(payload)).toBe(201)
    expect(sendLabelMessagesToArtists).toHaveBeenCalled()
    expect(emitNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'label_message',
        entityId: 'msg-1',
        artistId: 'artist-1',
      }),
    )
  })
})
