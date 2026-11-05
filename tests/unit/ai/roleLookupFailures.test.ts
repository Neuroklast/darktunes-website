import { describe, expect, it } from 'vitest'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'

type DbError = { message: string } | null

function clientWithQueries(options: {
  profile?: { role: string } | null
  profileError?: DbError
  rolesError?: DbError
  roles?: Array<{ role: string }>
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
              data: options.roles ?? [{ role: 'admin' }],
              error: options.rolesError ?? null,
            }),
          }),
        }
      }
      if (table === 'role_permissions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { can_publish_news: false, can_edit_news: false,
                  can_manage_artists: false, can_manage_releases: false,
                  can_manage_videos: false, can_view_admin_panel: false },
                error: null,
              }),
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

  it('does not silently treat editor custom-role lookup errors as absent grants', async () => {
    await expect(resolveEffectiveAccess(clientWithQueries({
      profile: { role: 'editor' },
      roles: [{ role: 'editor' }],
      customError: { message: 'timeout' },
    }), 'editor-1')).rejects.toThrow('Failed to load custom role assignments')
  })

  it('preserves verified admin base access when optional custom grants fail', async () => {
    const access = await resolveEffectiveAccess(clientWithQueries({
      customError: { message: 'timeout' },
    }), 'admin-1')
    expect(access.isAdmin).toBe(true)
  })

  it('accepts an independently valid user_roles grant when primary role is missing', async () => {
    const db = clientWithQueries({ profile: null })
    const access = await resolveEffectiveAccess(db, 'admin-1')
    // user_roles remains admin: user_roles is an independently valid grant.
    expect(access.isAdmin).toBe(true)
  })

  it('returns no access when both role sources are genuinely empty', async () => {
    const access = await resolveEffectiveAccess(
      clientWithQueries({ profile: null, roles: [] }), 'user-1',
    )
    expect(access.isAdmin).toBe(false)
    expect(access.capabilities.size).toBe(0)
  })
})