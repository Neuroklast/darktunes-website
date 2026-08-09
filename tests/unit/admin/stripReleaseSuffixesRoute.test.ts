import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

const requireAdminFromRequestMock = vi.fn()
const createServiceRoleSupabaseClientMock = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminFromRequest: (...args: unknown[]) => requireAdminFromRequestMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: createServiceRoleSupabaseClientMock,
}))

type ReleaseRow = { id: string; title: string }

function makeDb(rows: ReleaseRow[]) {
  const selectEqMock = vi.fn(async () => ({ data: rows, error: null }))
  const selectMock = vi.fn(() => ({ eq: selectEqMock }))

  const updateEqIdMock = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }))
  const updateMock = vi.fn((_payload: { title: string }) => ({ eq: updateEqIdMock }))

  const fromMock = vi.fn(() => ({
    select: selectMock,
    update: updateMock,
  }))

  return {
    db: { from: fromMock },
    selectMock,
    selectEqMock,
    updateMock,
  }
}

async function importRoute() {
  return import('../../../app/api/admin/maintenance/strip-release-suffixes/route')
}

describe('POST /api/admin/maintenance/strip-release-suffixes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminFromRequestMock.mockResolvedValue({
      userId: 'admin-user-id',
      role: 'admin',
      organizationId: DEFAULT_ORGANIZATION_ID,
    })
  })

  it('updates only rows whose title changes after suffix stripping', async () => {
    const { db, updateMock, selectEqMock } = makeDb([
      { id: 'r1', title: 'Darkwalker - Single' },
      { id: 'r2', title: 'Otherside - EP' },
      { id: 'r3', title: 'No Suffix Title' },
    ])
    createServiceRoleSupabaseClientMock.mockResolvedValue(db)

    const { POST } = await importRoute()
    const request = new NextRequest('http://localhost/api/admin/maintenance/strip-release-suffixes', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(selectEqMock).toHaveBeenCalledWith('organization_id', DEFAULT_ORGANIZATION_ID)
    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(updateMock.mock.calls[0][0]).toEqual({ title: 'Darkwalker' })
    expect(updateMock.mock.calls[1][0]).toEqual({ title: 'Otherside' })

    const json = await response.json()
    expect(json).toEqual({
      fixed: 2,
      titles: [
        { id: 'r1', before: 'Darkwalker - Single', after: 'Darkwalker' },
        { id: 'r2', before: 'Otherside - EP', after: 'Otherside' },
      ],
    })
  })

  it('is idempotent when all titles are already clean', async () => {
    const { db, updateMock } = makeDb([
      { id: 'r1', title: 'Darkwalker' },
      { id: 'r2', title: 'Otherside' },
    ])
    createServiceRoleSupabaseClientMock.mockResolvedValue(db)

    const { POST } = await importRoute()
    const request = new NextRequest('http://localhost/api/admin/maintenance/strip-release-suffixes', {
      method: 'POST',
      headers: { authorization: 'Bearer t' },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(updateMock).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({ fixed: 0, titles: [] })
  })
})
