import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

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
    vi.resetModules()
    requireAdminOrEditorFromRequest.mockResolvedValue({
      userId: 'u1',
      role: 'admin',
      organizationId: DEFAULT_ORGANIZATION_ID,
    })
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
      usedBytes: number
      assetCount: number
      zeroSizeCount: number
      limitBytes: number
      source: string
    }

    expect(res.status).toBe(200)
    expect(body.usedBytes).toBe(2048000)
    expect(body.assetCount).toBe(12)
    expect(body.zeroSizeCount).toBe(2)
    expect(body.source).toBe('rpc')
    expect(body.limitBytes).toBeGreaterThan(0)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  })

  it('falls back to paginated sum when RPC and aggregate fail', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{ size_bytes: 100 }, { size_bytes: 50 }],
      error: null,
    })
    const order = vi.fn().mockReturnValue({ range })
    const eq = vi.fn().mockReturnValue({ order, eq: vi.fn().mockReturnThis() })
    const select = vi.fn().mockImplementation((sel: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ count: 2, error: null }).then(resolve),
            catch: (fn: (e: unknown) => unknown) => Promise.resolve({ count: 2, error: null }).catch(fn),
          }),
        }
      }
      if (typeof sel === 'string' && sel.includes('sum')) {
        // Aggregate path fails → force paginated fallback
        return {
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'no agg' } }),
        }
      }
      // paginated select('size_bytes')
      return { eq: vi.fn().mockReturnValue({ order }) }
    })
    createServiceRoleSupabaseClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'missing fn' } }),
      from: vi.fn().mockReturnValue({ select }),
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
