import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireAdminOrEditorFromRequest = vi.fn()
const requireAdminFromRequest = vi.fn()
const createServiceRoleSupabaseClient = vi.fn()
const getLatestStorageSnapshot = vi.fn()
const runStorageScan = vi.fn()
const logAdminActionForRequest = vi.fn()
const createConfiguredR2Client = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminOrEditorFromRequest: (...args: unknown[]) => requireAdminOrEditorFromRequest(...args),
  requireAdminFromRequest: (...args: unknown[]) => requireAdminFromRequest(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: () => createServiceRoleSupabaseClient(),
}))

vi.mock('@/lib/r2/storageScan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/r2/storageScan')>('@/lib/r2/storageScan')
  return {
    ...actual,
    getLatestStorageSnapshot: (...args: unknown[]) => getLatestStorageSnapshot(...args),
    runStorageScan: (...args: unknown[]) => runStorageScan(...args),
  }
})

vi.mock('@/lib/adminAuditLog', () => ({
  logAdminActionForRequest: (...args: unknown[]) => logAdminActionForRequest(...args),
  auditAdminMutation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/r2Utils', () => ({
  createConfiguredR2Client: () => createConfiguredR2Client(),
}))

describe('GET /api/admin/storage-snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminOrEditorFromRequest.mockResolvedValue({ userId: 'u1', role: 'admin' })
    createServiceRoleSupabaseClient.mockResolvedValue({})
  })

  it('returns null when no snapshot exists', async () => {
    getLatestStorageSnapshot.mockResolvedValue(null)
    const { GET } = await import('../../../app/api/admin/storage-snapshots/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/storage-snapshots'))
    const body = (await res.json()) as { snapshot: null }
    expect(res.status).toBe(200)
    expect(body.snapshot).toBeNull()
  })
})

describe('POST /api/admin/storage-snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminFromRequest.mockResolvedValue({ userId: 'u1', role: 'admin' })
    createServiceRoleSupabaseClient.mockResolvedValue({})
    createConfiguredR2Client.mockResolvedValue({ s3: {}, bucket: 'b', publicUrl: 'https://cdn.example.com' })
    logAdminActionForRequest.mockResolvedValue(true)
  })

  it('returns 202 when the scan is truncated', async () => {
    runStorageScan.mockResolvedValue({
      truncated: true,
      snapshot: {
        id: 's1',
        status: 'running',
        used_bytes: 10,
        object_count: 2,
        orphan_bytes: 1,
        orphan_count: 1,
        multipart_aborted_count: 0,
        prefixes: [],
        truncated: true,
        next_cursor: 'token',
        error_message: null,
        scanned_by: 'u1',
        scanned_at: '2026-01-01T00:00:00Z',
        completed_at: null,
      },
    })
    const { POST } = await import('../../../app/api/admin/storage-snapshots/route')
    const res = await POST(
      new NextRequest('http://localhost/api/admin/storage-snapshots', {
        method: 'POST',
        body: '{}',
      }),
    )
    expect(res.status).toBe(202)
    const body = (await res.json()) as { snapshot: { next_cursor: string } }
    expect(body.snapshot.next_cursor).toBe('token')
  })
})
