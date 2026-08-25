/**
 * Golden auth for Phase D request-level admin helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiError } from '@/lib/errors'

const getUser = vi.fn()
const getUserRoleWithClient = vi.fn()
const createServerSupabaseClient = vi.fn()
const createServiceRoleSupabaseClient = vi.fn()
const authGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => createServerSupabaseClient(),
  createServiceRoleSupabaseClient: () => createServiceRoleSupabaseClient(),
}))

vi.mock('@/lib/getUserRole', () => ({
  getUserRoleWithClient: (...args: unknown[]) => getUserRoleWithClient(...args),
}))

vi.mock('@/lib/organizations/requestContext', () => ({
  getRequestOrganizationId: vi
    .fn()
    .mockResolvedValue('00000000-0000-0000-0000-000000000000'),
}))

vi.mock('@/lib/organizations/assertAdminOrganizationAccess', () => ({
  assertAdminOrganizationAccess: vi.fn().mockResolvedValue(undefined),
}))

// Service-role path uses createClient from supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: authGetUser },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }),
}))

import {
  requireAdminFromRequest,
  requireAdminOrEditorFromRequest,
} from '@/lib/adminAuth'

function makeReq(auth: string | null) {
  return new NextRequest('http://localhost/api/admin/users', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('requireAdminFromRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser } })
    createServiceRoleSupabaseClient.mockResolvedValue({ from: vi.fn() })
  })

  it('401 when no Bearer and no cookie session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'none' } })
    await expect(requireAdminFromRequest(makeReq(null))).rejects.toMatchObject({ status: 401 })
  })

  it('403 when cookie user is not admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getUserRoleWithClient.mockResolvedValue('artist')
    await expect(requireAdminFromRequest(makeReq(null))).rejects.toMatchObject({ status: 403 })
  })

  it('200 path: cookie admin', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    getUserRoleWithClient.mockResolvedValue('admin')
    const result = await requireAdminFromRequest(makeReq(null))
    expect(result.userId).toBe('admin-1')
    expect(result.role).toBe('admin')
    expect(result.organizationId).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('Bearer admin succeeds', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'admin-2' } }, error: null })
    getUserRoleWithClient.mockResolvedValue('admin')
    const result = await requireAdminFromRequest(makeReq('Bearer tok'))
    expect(result.userId).toBe('admin-2')
  })

  it('stale Bearer 401 falls through to cookie admin session', async () => {
    authGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt expired' } })
    getUser.mockResolvedValue({ data: { user: { id: 'admin-cookie' } }, error: null })
    getUserRoleWithClient.mockResolvedValue('admin')
    const result = await requireAdminFromRequest(makeReq('Bearer expired'))
    expect(result.userId).toBe('admin-cookie')
  })
})

describe('requireAdminOrEditorFromRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    createServerSupabaseClient.mockResolvedValue({ auth: { getUser } })
  })

  it('allows editor via cookie', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'ed-1' } }, error: null })
    getUserRoleWithClient.mockResolvedValue('editor')
    const result = await requireAdminOrEditorFromRequest(makeReq(null))
    expect(result.role).toBe('editor')
  })

  it('rejects artist via cookie', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'a1' } }, error: null })
    getUserRoleWithClient.mockResolvedValue('artist')
    await expect(requireAdminOrEditorFromRequest(makeReq(null))).rejects.toBeInstanceOf(ApiError)
  })
})
