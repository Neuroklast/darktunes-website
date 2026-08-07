import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireAdminOrEditorFromRequest = vi.fn()
const createServiceRoleSupabaseClient = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminOrEditorFromRequest: (...args: unknown[]) =>
    requireAdminOrEditorFromRequest(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: () => createServiceRoleSupabaseClient(),
}))

describe('GET /api/admin/assets/storage-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminOrEditorFromRequest.mockResolvedValue({ userId: 'u1', role: 'admin' })
  })

  it('returns RPC totals with coerced bigint strings', async () => {
    createServiceRoleSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ used_bytes: '2048000', asset_count: '12' }],
        error: null,
      }),
    })

    const { GET } = await import('../../../app/api/admin/assets/storage-stats/route')
    const res = await GET(
      new NextRequest('http://localhost/api/admin/assets/storage-stats', {
        headers: { Authorization: 'Bearer t' },
      }),
    )
    const body = (await res.json()) as {
      usedBytes: number
      assetCount: number
      limitBytes: number
      source: string
    }

    expect(res.status).toBe(200)
    expect(body.usedBytes).toBe(2048000)
    expect(body.assetCount).toBe(12)
    expect(body.source).toBe('rpc')
    expect(body.limitBytes).toBeGreaterThan(0)
  })

  it('falls back to paginated sum when RPC fails', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{ size_bytes: 100 }, { size_bytes: 50 }],
      error: null,
    })
    createServiceRoleSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing fn' } }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range,
      }),
    })

    const { GET } = await import('../../../app/api/admin/assets/storage-stats/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/assets/storage-stats'))
    const body = (await res.json()) as { usedBytes: number; assetCount: number; source: string }

    expect(res.status).toBe(200)
    expect(body.usedBytes).toBe(150)
    expect(body.assetCount).toBe(2)
    expect(body.source).toBe('paginated')
  })
})
