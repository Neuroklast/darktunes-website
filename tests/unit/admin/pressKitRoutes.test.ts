import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

const requireAdminOrEditorFromRequestMock = vi.fn()
const verifyPermissionMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()
const getPressKitItemsMock = vi.fn()
const addToPressKitMock = vi.fn()
const removeFromPressKitMock = vi.fn()
const reorderPressKitMock = vi.fn()
const revalidateTagMock = vi.fn()

vi.mock('@/lib/adminAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/adminAuth')>()
  return {
    ...actual,
    requireAdminOrEditorFromRequest: (...args: unknown[]) =>
      requireAdminOrEditorFromRequestMock(...args),
    verifyPermission: (...args: unknown[]) => verifyPermissionMock(...args),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/lib/api/pressKit', () => ({
  getPressKitItems: getPressKitItemsMock,
  addToPressKit: addToPressKitMock,
  removeFromPressKit: removeFromPressKitMock,
  reorderPressKit: reorderPressKitMock,
}))

vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
}))

const AUTH = { authorization: 'Bearer admin-token' }
const ORG = DEFAULT_ORGANIZATION_ID

const mockKitItem = {
  id: 'kit-item-1',
  assetId: 'asset-1',
  artistId: 'artist-1',
  displayOrder: 0,
  createdAt: '2026-01-01T00:00:00Z',
}

function mockDbWithAsset(orgId: string = ORG) {
  return {
    from: vi.fn((table: string) => {
      const id = table === 'artists' ? 'artist-1' : 'asset-1'
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id, organization_id: orgId },
              error: null,
            }),
          })),
        })),
      }
    }),
  }
}

async function loadPressKitRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/press-kit/route')
}

async function loadPressKitIdRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/press-kit/[id]/route')
}

async function loadPressKitReorderRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/press-kit/reorder/route')
}

describe('admin press-kit routes', () => {
  beforeEach(() => {
    requireAdminOrEditorFromRequestMock.mockResolvedValue({
      userId: 'admin-user-1',
      role: 'admin',
      organizationId: ORG,
    })
    verifyPermissionMock.mockResolvedValue('admin-user-1')
    createServerSupabaseClientMock.mockResolvedValue(mockDbWithAsset())
    getPressKitItemsMock.mockResolvedValue([mockKitItem])
    addToPressKitMock.mockResolvedValue(mockKitItem)
    removeFromPressKitMock.mockResolvedValue(undefined)
    reorderPressKitMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/admin/press-kit', () => {
    it('returns all kit items when no artistId filter is set', async () => {
      const { GET } = await loadPressKitRoute()
      const response = await GET(new NextRequest('http://localhost/api/admin/press-kit', { headers: AUTH }))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toEqual([mockKitItem])
      expect(getPressKitItemsMock).toHaveBeenCalledWith(expect.anything(), undefined, ORG)
    })

    it('scopes to label-wide kit when artistId=label', async () => {
      const { GET } = await loadPressKitRoute()
      await GET(
        new NextRequest('http://localhost/api/admin/press-kit?artistId=label', { headers: AUTH }),
      )

      expect(getPressKitItemsMock).toHaveBeenCalledWith(expect.anything(), null, ORG)
    })

    it('scopes to a specific artist when artistId is a UUID', async () => {
      const artistId = '123e4567-e89b-12d3-a456-426614174000'
      const { GET } = await loadPressKitRoute()
      await GET(
        new NextRequest(`http://localhost/api/admin/press-kit?artistId=${artistId}`, { headers: AUTH }),
      )

      expect(getPressKitItemsMock).toHaveBeenCalledWith(expect.anything(), artistId, ORG)
    })
  })

  describe('POST /api/admin/press-kit', () => {
    it('adds an asset to the press kit and revalidates cache', async () => {
      const { POST } = await loadPressKitRoute()
      const response = await POST(
        new NextRequest('http://localhost/api/admin/press-kit', {
          method: 'POST',
          headers: { ...AUTH, 'content-type': 'application/json' },
          body: JSON.stringify({ assetId: 'asset-1', artistId: 'artist-1', displayOrder: 3 }),
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.item).toEqual(mockKitItem)
      expect(addToPressKitMock).toHaveBeenCalledWith(expect.anything(), {
        assetId: 'asset-1',
        artistId: 'artist-1',
        displayOrder: 3,
      })
      expect(revalidateTagMock).toHaveBeenCalledWith('press-kit', 'max')
    })

    it('returns 400 when assetId is missing', async () => {
      const { POST } = await loadPressKitRoute()
      const response = await POST(
        new NextRequest('http://localhost/api/admin/press-kit', {
          method: 'POST',
          headers: { ...AUTH, 'content-type': 'application/json' },
          body: JSON.stringify({ artistId: 'artist-1' }),
        }),
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ error: 'assetId is required' })
    })
  })

  describe('DELETE /api/admin/press-kit/[id]', () => {
    it('removes a kit item and revalidates cache', async () => {
      const { DELETE } = await loadPressKitIdRoute()
      const response = await DELETE(
        new NextRequest('http://localhost/api/admin/press-kit/kit-item-1', { headers: AUTH }),
      )

      expect(response.status).toBe(200)
      expect(removeFromPressKitMock).toHaveBeenCalled()
      expect(revalidateTagMock).toHaveBeenCalledWith('press-kit', 'max')
    })
  })

  describe('PATCH /api/admin/press-kit/reorder', () => {
    it('reorders kit items', async () => {
      const { PATCH } = await loadPressKitReorderRoute()
      const response = await PATCH(
        new NextRequest('http://localhost/api/admin/press-kit/reorder', {
          method: 'PATCH',
          headers: { ...AUTH, 'content-type': 'application/json' },
          body: JSON.stringify({ orderedItemIds: ['kit-item-1'] }),
        }),
      )

      expect(response.status).toBe(200)
      expect(reorderPressKitMock).toHaveBeenCalledWith(expect.anything(), null, ['kit-item-1'])
    })
  })
})
