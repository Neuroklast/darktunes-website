import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireAdminOrEditorFromRequest = vi.fn()
const createServiceRoleSupabaseClient = vi.fn()
const getLatestStorageSnapshot = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminOrEditorFromRequest: (...args: unknown[]) =>
    requireAdminOrEditorFromRequest(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: () => createServiceRoleSupabaseClient(),
}))

vi.mock('@/lib/r2/storageScan', () => ({
  getLatestStorageSnapshot: (...args: unknown[]) => getLatestStorageSnapshot(...args),
}))

describe('GET /api/admin/assets/storage-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    requireAdminOrEditorFromRequest.mockResolvedValue({ userId: 'u1', role: 'admin' })
    getLatestStorageSnapshot.mockResolvedValue(null)
  })

  it('returns RPC totals with coerced bigint strings', async () => {
    createServiceRoleSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: { used_bytes: '2048000', asset_count: '12', zero_size_count: '2' },
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
      used_bytes: number
      catalog_used_bytes: number
      asset_count: number
      zero_size_count: number
      limit_bytes: number
      source: string
    }

    expect(res.status).toBe(200)
    expect(body.used_bytes).toBe(2048000)
    expect(body.catalog_used_bytes).toBe(2048000)
    expect(body.asset_count).toBe(12)
    expect(body.zero_size_count).toBe(2)
    expect(body.source).toBe('rpc')
    expect(body.limit_bytes).toBeGreaterThan(0)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  })

  it('falls back to paginated sum when RPC and aggregate fail', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{ size_bytes: 100 }, { size_bytes: 50 }],
      error: null,
    })
    const select = vi.fn().mockImplementation((sel: string) => {
      if (typeof sel === 'string' && sel.includes('sum')) {
        return Promise.resolve({ data: null, error: { message: 'no agg' } })
      }
      return {
        order: vi.fn().mockReturnThis(),
        range,
        eq: vi.fn().mockReturnThis(),
      }
    })
    createServiceRoleSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing fn' } }),
      from: vi.fn().mockReturnValue({ select }),
    })

    const { GET } = await import('../../../app/api/admin/assets/storage-stats/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/assets/storage-stats'))
    const body = (await res.json()) as { used_bytes: number; asset_count: number; source: string }

    expect(res.status).toBe(200)
    expect(body.used_bytes).toBe(150)
    expect(body.asset_count).toBe(2)
    expect(body.source).toBe('paginated')
  })
})
