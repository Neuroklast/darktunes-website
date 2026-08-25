import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/errors'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { assertAdminOrganizationAccess } from '@/lib/organizations/assertAdminOrganizationAccess'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const ORG_B = '11111111-1111-1111-1111-111111111111'

function mockDb(handlers: {
  platform?: { data: unknown; error: null | { message: string; code?: string } }
  member?: { data: unknown; error: null | { message: string; code?: string } }
}) {
  return {
    from: vi.fn((table: string) => {
      const result =
        table === 'platform_admins'
          ? (handlers.platform ?? { data: null, error: null })
          : (handlers.member ?? { data: null, error: null })
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve(result),
      }
      return chain
    }),
  } as unknown as SupabaseClient<Database>
}

describe('assertAdminOrganizationAccess', () => {
  it('allows platform admins for any org', async () => {
    const db = mockDb({
      platform: { data: { user_id: 'u1' }, error: null },
    })
    await expect(assertAdminOrganizationAccess(db, 'u1', ORG_B)).resolves.toBeUndefined()
  })

  it('allows organization_users membership', async () => {
    const db = mockDb({
      platform: { data: null, error: null },
      member: { data: { user_id: 'u1' }, error: null },
    })
    await expect(assertAdminOrganizationAccess(db, 'u1', ORG_B)).resolves.toBeUndefined()
  })

  it('allows Org #0 without membership (legacy)', async () => {
    const db = mockDb({
      platform: { data: null, error: null },
      member: { data: null, error: null },
    })
    await expect(
      assertAdminOrganizationAccess(db, 'u1', DEFAULT_ORGANIZATION_ID),
    ).resolves.toBeUndefined()
  })

  it('rejects non-member of pilot org', async () => {
    const db = mockDb({
      platform: { data: null, error: null },
      member: { data: null, error: null },
    })
    await expect(assertAdminOrganizationAccess(db, 'u1', ORG_B)).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<ApiError>)
  })

  it('allows Org #0 when organization_users table is missing', async () => {
    const db = mockDb({
      platform: { data: null, error: null },
      member: {
        data: null,
        error: { message: 'relation "organization_users" does not exist', code: '42P01' },
      },
    })
    await expect(
      assertAdminOrganizationAccess(db, 'u1', DEFAULT_ORGANIZATION_ID),
    ).resolves.toBeUndefined()
  })
})
