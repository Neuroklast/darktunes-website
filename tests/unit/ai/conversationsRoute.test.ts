import { beforeEach, describe, it, vi } from 'vitest'
import { jsonRequest, expectUnauthorized } from '../../helpers/api/routeTestkit'
import { ApiError } from '@/lib/errors'

const requireAiActor = vi.fn()

vi.mock('@/lib/ai/auth/requireAiActor', () => ({
  requireAiActor: (...args: unknown[]) => requireAiActor(...args),
}))

vi.mock('@/lib/api/aiConversations', () => ({
  listAiConversations: vi.fn(async () => ({ items: [], next_cursor: null })),
  createAiConversation: vi.fn(),
}))

vi.mock('@/lib/rateLimitDistributed', () => ({
  checkDistributedRateLimit: vi.fn(async () => ({ limited: false, backend: 'memory' })),
}))

async function importRoute() {
  return import('../../../app/api/ai/conversations/route')
}

describe('GET /api/ai/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should reject unauthenticated callers', async () => {
    requireAiActor.mockRejectedValue(new ApiError(401, 'Unauthorized'))
    const { GET } = await importRoute()
    const res = await GET(jsonRequest('/api/ai/conversations'))
    await expectUnauthorized(res)
  })
})
