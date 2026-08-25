import { describe, expect, it, vi } from 'vitest'
import { assertBillingOrganizationAccess } from '@/lib/stripe/assertBillingOrganizationAccess'
import { ApiError } from '@/lib/errors'

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function mockDb(handlers: {
  platformAdmin?: { user_id: string } | null
  platformError?: { message: string; code?: string } | null
  membership?: { user_id: string } | null
  memberError?: { message: string; code?: string } | null
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'platform_admins') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: handlers.platformAdmin ?? null,
                error: handlers.platformError ?? null,
              }),
            }),
          }),
        }
      }
      if (table === 'organization_users') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: handlers.membership ?? null,
                  error: handlers.memberError ?? null,
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    }),
  }
}

describe('assertBillingOrganizationAccess', () => {
  it('allows platform admins for any org', async () => {
    const db = mockDb({ platformAdmin: { user_id: 'u1' } })
    await expect(
      assertBillingOrganizationAccess(db as never, 'u1', ORG_B),
    ).resolves.toBeUndefined()
  })

  it('allows organization_users membership', async () => {
    const db = mockDb({
      platformAdmin: null,
      membership: { user_id: 'u1' },
    })
    await expect(
      assertBillingOrganizationAccess(db as never, 'u1', ORG_A),
    ).resolves.toBeUndefined()
  })

  it('denies non-members (no Org #0 free-pass)', async () => {
    const db = mockDb({ platformAdmin: null, membership: null })
    await expect(
      assertBillingOrganizationAccess(db as never, 'u1', ORG_B),
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<ApiError>)
  })

  it('returns 503 when membership table is missing', async () => {
    const db = mockDb({
      platformAdmin: null,
      memberError: { message: 'relation "organization_users" does not exist', code: '42P01' },
    })
    await expect(
      assertBillingOrganizationAccess(db as never, 'u1', ORG_A),
    ).rejects.toMatchObject({ status: 503 })
  })
})
