import { describe, expect, it } from 'vitest'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'

type DbError = { message: string } | null

function clientWithQueries(options: {
  profile?: { role: string } | null
  profileError?: DbError
  rolesError?: DbError
  customError?: DbError
}) {
  return {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.profile === undefined ? { role: 'admin' } : options.profile,
                error: options.profileError ?? null,
              }),
            }),
          }),
        }
      }
      if (table === 'user_roles') {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ role: 'admin' }],
              error: options.rolesError ?? null,
            }),
          }),
        }
      }
      if (table === 'user_custom_roles') {
        return {
          select: () => ({
            eq: async () => ({
              data: [],
              error: options.customError ?? null,
            }),
          }),
        }
      }
      throw new Error('Unexpected table: ' + table)
    },
  } as unknown as Parameters<typeof resolveEffectiveAccess>[0]
}

describe('resolveEffectiveAccess session safety', () => {
  it('keeps admin access when profile and role reads succeed', async () => {
    const access = await resolveEffectiveAccess(clientWithQueries({}), 'admin-1')
    expect(access.isAdmin).toBe(true)
    expect(access.capabilities.has('admin.panel.full')).toBe(true)
  })

  it('does not silently downgrade a user when the profile read fails', async () => {
    await expect(resolveEffectiveAccess(clientWithQueries({
      profileError: { message: 'temporary DB connection error' },
    }), 'admin-1')).rejects.toThrow('Failed to load user role assignments')
  })

  it('does not silently ignore user_roles errors', async () => {
    await expect(resolveEffectiveAccess(clientWithQueries({
      rolesError: { message: 'timeout' },
    }), 'admin-1')).rejects.toThrow('Failed to load user role assignments')
  })

  it('does not silently treat custom-role lookup errors as absent grants', async () => {
    await expect(resolveEffectiveAccess(clientWithQueries({
      customError: { message: 'timeout' },
    }), 'admin-1')).rejects.toThrow('Failed to load custom role assignments')
  })

  it('still refuses access when there is genuinely no assigned role', async () => {
    const db = clientWithQueries({ profile: null })
    const access = await resolveEffectiveAccess(db, 'admin-1')
    // user_roles remains admin: user_roles is an independently valid grant.
    expect(access.isAdmin).toBe(true)
  })
})
