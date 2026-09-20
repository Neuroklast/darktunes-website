import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { deriveAdminAuditMeta, isMutatingMethod } from './adminAuditContext'

function makeRequest(url: string, method = 'PATCH'): NextRequest {
  return new NextRequest(url, { method })
}

describe('deriveAdminAuditMeta', () => {
  it('replaces UUIDs with :id and keeps the resource', () => {
    const meta = deriveAdminAuditMeta(
      makeRequest(
        'http://localhost/api/admin/users/3f2b1c4d-0000-4000-8000-000000000000',
      ),
    )
    expect(meta).toEqual({
      action: 'admin.patch./users/:id',
      resource: 'users',
      resourceId: '3f2b1c4d-0000-4000-8000-000000000000',
    })
  })

  it('keeps trailing sub-resource actions', () => {
    const meta = deriveAdminAuditMeta(
      makeRequest(
        'http://localhost/api/admin/users/3f2b1c4d-0000-4000-8000-000000000000/resend-invite',
        'POST',
      ),
    )
    expect(meta.action).toBe('admin.post./users/:id/resend-invite')
    expect(meta.resource).toBe('users')
  })

  it('handles collection routes without an id', () => {
    const meta = deriveAdminAuditMeta(
      makeRequest('http://localhost/api/admin/maintenance/clear-logs', 'POST'),
    )
    expect(meta.action).toBe('admin.post./maintenance/clear-logs')
    expect(meta.resourceId).toBeNull()
  })
})

describe('isMutatingMethod', () => {
  it('detects mutating verbs case-insensitively', () => {
    expect(isMutatingMethod('post')).toBe(true)
    expect(isMutatingMethod('DELETE')).toBe(true)
    expect(isMutatingMethod('GET')).toBe(false)
  })
})
