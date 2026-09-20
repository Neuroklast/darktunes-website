import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockInsert } = vi.hoisted(() => ({
  mockInsert: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: vi.fn(async () => ({
    from: () => ({ insert: mockInsert }),
  })),
}))

import { auditAdminMutation } from './adminAuditLog'
import { markAdminRequestAudited, setAdminAuditActor } from './adminAuditContext'

function makeRequest(url: string, method = 'POST'): NextRequest {
  return new NextRequest(url, { method })
}

describe('auditAdminMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores non-admin paths even for authenticated mutations', async () => {
    const req = makeRequest('http://localhost/api/portal/profile', 'PATCH')
    setAdminAuditActor(req, { userId: 'artist-1', role: 'artist' })

    await auditAdminMutation(req, 200)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('writes an entry for admin mutations with a recorded actor', async () => {
    const req = makeRequest(
      'http://localhost/api/admin/users/3f2b1c4d-0000-4000-8000-000000000000',
      'PATCH',
    )
    setAdminAuditActor(req, { userId: 'admin-1', role: 'admin' })

    await auditAdminMutation(req, 200)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: 'admin-1',
        action: 'admin.patch./users/:id',
        resource: 'users',
      }),
    )
  })

  it('does not duplicate an explicitly audited request', async () => {
    const req = makeRequest('http://localhost/api/admin/users/invite', 'POST')
    setAdminAuditActor(req, { userId: 'admin-1', role: 'admin' })
    markAdminRequestAudited(req)

    await auditAdminMutation(req, 200)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('skips transport-only presign/multipart endpoints', async () => {
    const req = makeRequest(
      'http://localhost/api/admin/sos/import-batches/x/multipart/presign-part',
      'POST',
    )
    setAdminAuditActor(req, { userId: 'admin-1', role: 'admin' })

    await auditAdminMutation(req, 200)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('ignores non-mutating methods', async () => {
    const req = makeRequest('http://localhost/api/admin/users', 'GET')
    setAdminAuditActor(req, { userId: 'admin-1', role: 'admin' })

    await auditAdminMutation(req, 200)

    expect(mockInsert).not.toHaveBeenCalled()
  })
})
