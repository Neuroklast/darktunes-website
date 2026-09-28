import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireAdminFromRequest = vi.fn()
const createServiceRoleSupabaseClient = vi.fn()
const purgeOrphanObjects = vi.fn()
const logAdminActionForRequest = vi.fn()
const createConfiguredR2Client = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminFromRequest: (...args: unknown[]) => requireAdminFromRequest(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: () => createServiceRoleSupabaseClient(),
}))

vi.mock('@/lib/r2/orphanPurge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/r2/orphanPurge')>('@/lib/r2/orphanPurge')
  return {
    ...actual,
    purgeOrphanObjects: (...args: unknown[]) => purgeOrphanObjects(...args),
  }
})

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminActionForRequest: (...args: unknown[]) => logAdminActionForRequest(...args),
  auditAdminMutation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/r2Utils', () => ({
  createConfiguredR2Client: () => createConfiguredR2Client(),
}))

describe('POST /api/admin/r2-orphan-purges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminFromRequest.mockResolvedValue({ userId: 'u1', role: 'admin' })
    createServiceRoleSupabaseClient.mockResolvedValue({})
    createConfiguredR2Client.mockResolvedValue({ s3: {}, bucket: 'b', publicUrl: 'https://cdn.example.com' })
    logAdminActionForRequest.mockResolvedValue(true)
  })

  it('rejects the wrong confirmation phrase', async () => {
    const { POST } = await import('../../../app/api/admin/r2-orphan-purges/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/r2-orphan-purges', {
        method: 'POST',
        body: JSON.stringify({ confirmation: 'please' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('purges after the typed confirmation', async () => {
    purgeOrphanObjects.mockResolvedValue({ deleted: 3, skipped: 1, remaining: 0 })
    const { POST } = await import('../../../app/api/admin/r2-orphan-purges/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/r2-orphan-purges', {
        method: 'POST',
        body: JSON.stringify({ confirmation: 'DELETE ORPHANS' }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { deleted: number }
    expect(body.deleted).toBe(3)
  })
})
