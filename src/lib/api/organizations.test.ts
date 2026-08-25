import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import {
  getDefaultOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  isUserPlatformAdmin,
  listOrganizations,
  listOrganizationsAccessibleToUser,
} from './organizations'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const orgRow = {
  id: DEFAULT_ORGANIZATION_ID,
  name: 'darkTunes Music Group',
  slug: 'darktunes',
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('organizations DAL', () => {
  it('getOrganizationById maps row to domain type', async () => {
    const db = makeMockDb(orgRow)
    const result = await getOrganizationById(db, DEFAULT_ORGANIZATION_ID)
    expect(result?.name).toBe('darkTunes Music Group')
    expect(result?.slug).toBe('darktunes')
  })

  it('getOrganizationBySlug queries by slug', async () => {
    const db = makeMockDb(orgRow)
    const result = await getOrganizationBySlug(db, 'darktunes')
    expect(result?.id).toBe(DEFAULT_ORGANIZATION_ID)
  })

  it('getDefaultOrganization uses sentinel id', async () => {
    const db = makeMockDb(orgRow)
    const result = await getDefaultOrganization(db)
    expect(result?.id).toBe(DEFAULT_ORGANIZATION_ID)
  })

  it('listOrganizations returns mapped rows', async () => {
    const db = makeMockDb([orgRow])
    const result = await listOrganizations(db)
    expect(result).toHaveLength(1)
    expect(result[0]?.slug).toBe('darktunes')
  })

  it('isUserPlatformAdmin is true when row exists', async () => {
    const db = makeMockDb({ user_id: 'u1' })
    await expect(isUserPlatformAdmin(db, 'u1')).resolves.toBe(true)
  })

  it('listOrganizationsAccessibleToUser returns all orgs for platform admin', async () => {
    const demo = {
      ...orgRow,
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Demo',
      slug: 'demo-label',
    }
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'platform_admins') {
          return makeBuilder({ user_id: 'u1' })
        }
        return makeBuilder([orgRow, demo])
      }),
    } as unknown as DbClient
    const result = await listOrganizationsAccessibleToUser(db, 'u1')
    expect(result).toHaveLength(2)
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'DB error' })
    await expect(getOrganizationById(db, 'x')).rejects.toThrow('DB error')
  })
})

