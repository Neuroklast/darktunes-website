import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest } from '../../helpers/api/routeTestkit'

const requireAiActor = vi.fn()
const getAiConversationForUser = vi.fn()
const assertConversationContext = vi.fn()
const markStaleAiTurnFailed = vi.fn()
const listAiMessagesPage = vi.fn()

vi.mock('@/lib/ai/auth/requireAiActor', () => ({
  requireAiActor: (...args: unknown[]) => requireAiActor(...args),
}))

vi.mock('@/lib/api/aiConversations', () => ({
  getAiConversationForUser: (...args: unknown[]) => getAiConversationForUser(...args),
  assertConversationContext: (...args: unknown[]) => assertConversationContext(...args),
  markStaleAiTurnFailed: (...args: unknown[]) => markStaleAiTurnFailed(...args),
  listAiMessagesPage: (...args: unknown[]) => listAiMessagesPage(...args),
  renameAiConversation: vi.fn(),
  deleteAiConversation: vi.fn(),
}))

async function importRoute() {
  return import('../../../app/api/ai/conversations/[id]/route')
}

const conversation = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  artistId: null,
  accessContext: 'admin' as const,
  title: 'Test',
  status: 'active' as const,
  activeRequestId: null,
  activeRequestStartedAt: null,
  cancelRequestedAt: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
}

function message(id: string, content: string) {
  return {
    id,
    conversationId: conversation.id,
    role: 'user' as const,
    content,
    model: null,
    tokenUsage: {},
    status: 'complete' as const,
    toolCalls: [],
    toolCallId: null,
    metadata: {},
    createdAt: '2026-10-20T00:00:00.000Z',
  }
}

describe('GET /api/ai/conversations/{id}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAiActor.mockResolvedValue({
      userId: 'user-1',
      serviceDb: {},
    })
    getAiConversationForUser.mockResolvedValue(conversation)
    markStaleAiTurnFailed.mockResolvedValue(conversation)
    listAiMessagesPage.mockResolvedValue({
      items: [message('m3', 'third'), message('m2', 'second'), message('m1', 'first')],
      next_cursor: 'older',
    })
  })

  it('returns messages in chronological order for the client', async () => {
    const { GET } = await importRoute()
    const res = await GET(
      jsonRequest(`/api/ai/conversations/${conversation.id}`, {
        searchParams: { dashboard: 'admin' },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { messages: Array<{ id: string }> }
    expect(body.messages.map((row) => row.id)).toEqual(['m1', 'm2', 'm3'])
  })
})
