import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest } from '../../helpers/api/routeTestkit'

const requireAiActor = vi.fn()
vi.mock('@/lib/ai/auth/requireAiActor', () => ({
  requireAiActor: (...args: unknown[]) => requireAiActor(...args),
}))

describe('AI diagnostics authorization', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['artist', 'editor'] as const)(
    'scopes %s error lookup to the authenticated user',
    async (role) => {
      const filters: Array<[string, string]> = []
      const query = {
        eq(column: string, value: string) {
          filters.push([column, value])
          return this
        },
        ilike() { return this },
        limit() { return this },
        async maybeSingle() { return { data: null, error: null } },
      }
      requireAiActor.mockResolvedValue({
        userId: 'user-a',
        role,
        serviceDb: {
          from(table: string) {
            expect(table).toBe('app_logs')
            return { select: () => query }
          },
        },
      })
      const { POST } = await import('../../../app/api/ai/diagnostics/route')
      const response = await POST(jsonRequest('/api/ai/diagnostics', {
        body: { fingerprint: 'shared-error' },
      }))
      expect(response.status).toBe(404)
      expect(filters).toContainEqual(['user_id', 'user-a'])
    },
  )

  it('does not allow editors to generate global developer reports', async () => {
    const from = vi.fn(() => { throw new Error('Editor should not query app_logs') })
    requireAiActor.mockResolvedValue({
      role: 'editor',
      userId: 'editor-a',
      capabilities: new Set(['admin.panel.editor', 'cms.artists.manage']),
      serviceDb: { from },
    })
    const { POST } = await import('../../../app/api/ai/diagnostic-reports/route')
    const response = await POST(jsonRequest('/api/ai/diagnostic-reports', {
      body: { error_id: 'error-123' },
    }))
    expect(response.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })
})
