import type { SupabaseClient } from '@supabase/supabase-js'
import type { RolePermissionKey } from '@/lib/adminAuth'
import type { Database } from '@/types/database'
import type { ActiveUserRole } from './normalizeRole'
import {
  ROLE_BASE_CAPABILITIES,
  capabilitiesFromPermissionKey,
  capabilitiesFromRolePermissions,
} from './registry'
import { normalizeRole, normalizeRoles } from './normalizeRole'
import type { Capability, EffectiveAccess } from './types'

type DbClient = SupabaseClient<Database>

type RolePermissionsRow = Database['public']['Tables']['role_permissions']['Row']
type RolePermissionsRole = RolePermissionsRow['role']

type CustomRoleAssignment = {
  role_id: string
  custom_roles: {
    name: string
    custom_role_permissions: { permission_name: string }[] | null
  } | null
}

const PERMISSION_COLUMNS: RolePermissionKey[] = [
  'can_publish_news',
  'can_edit_news',
  'can_manage_artists',
  'can_manage_releases',
  'can_manage_videos',
  'can_view_admin_panel',
]

function emptyAccess(): EffectiveAccess {
  return {
    primaryRole: null,
    allRoles: [],
    permissions: new Set(),
    capabilities: new Set(),
    customRoleNames: [],
    isAdmin: false,
  }
}

function mergeRolePermissionsRow(row: RolePermissionsRow | null): {
  permissions: Set<string>
  capabilities: Set<Capability>
} {
  if (!row) {
    return { permissions: new Set(), capabilities: new Set() }
  }

  const flags: Partial<Record<RolePermissionKey, boolean>> = {}
  for (const key of PERMISSION_COLUMNS) {
    flags[key] = row[key]
  }

  const permissions = new Set<string>()
  for (const key of PERMISSION_COLUMNS) {
    if (row[key]) permissions.add(key)
  }

  return {
    permissions,
    capabilities: capabilitiesFromRolePermissions(flags),
  }
}

function applyRoleBaseCapabilities(
  role: ActiveUserRole | null,
  permissions: Set<string>,
  capabilities: Set<Capability>,
): void {
  if (!role) return
  const base = ROLE_BASE_CAPABILITIES[role] ?? []
  for (const cap of base) {
    capabilities.add(cap)
  }
  if (role === 'admin') {
    for (const key of PERMISSION_COLUMNS) {
      permissions.add(key)
    }
  }
}

async function loadCustomGrants(
  client: DbClient,
  userId: string,
): Promise<{ permissions: Set<string>; capabilities: Set<Capability>; roleNames: string[] }> {
  const permissions = new Set<string>()
  const capabilities = new Set<Capability>()
  const roleNames: string[] = []

  const { data: assignments, error } = await client
    .from('user_custom_roles')
    .select('role_id, custom_roles(name, custom_role_permissions(permission_name))')
    .eq('user_id', userId)

  // A temporary database/RLS failure must never look like an empty grant set.
  // Otherwise an authenticated editor can be misclassified as unauthorized.
  if (error) throw new Error('Failed to load custom role assignments', { cause: error })
  if (!assignments?.length) {
    return { permissions, capabilities, roleNames }
  }

  for (const assignment of (assignments ?? []) as CustomRoleAssignment[]) {
    const customRole = assignment.custom_roles
    if (!customRole) continue
    roleNames.push(customRole.name)
    for (const grant of customRole.custom_role_permissions ?? []) {
      permissions.add(grant.permission_name)
      for (const cap of capabilitiesFromPermissionKey(grant.permission_name)) {
        capabilities.add(cap)
      }
    }
  }

  return { permissions, capabilities, roleNames }
}

/**
 * Resolves the caller's effective permissions by merging primary role, all system
 * roles, `role_permissions`, and supplemental custom roles.
 */
export async function resolveEffectiveAccess(
  client: DbClient,
  userId: string,
): Promise<EffectiveAccess> {
  const [{ data: profile, error: profileError }, { data: roleRows, error: roleRowsError }] = await Promise.all([
    client.from('users').select('role').eq('id', userId).maybeSingle(),
    client.from('user_roles').select('role').eq('user_id', userId),
  ])

  // Fail closed on errors, but distinguish an unavailable permission lookup
  // from a real access denial. Never turn a failed query into "unauthorized".
  if (profileError || roleRowsError) {
    throw new Error('Failed to load user role assignments', {
      cause: profileError ?? roleRowsError,
    })
  }

  const primaryRole = normalizeRole(profile?.role ?? null)
  const allRoles = normalizeRoles([
    ...(roleRows ?? []).map((row) => row.role),
    profile?.role ?? '',
  ].filter(Boolean))

  if (!primaryRole && allRoles.length === 0) {
    return emptyAccess()
  }

  const effectivePrimary = primaryRole ?? allRoles[0] ?? null
  const isAdmin = effectivePrimary === 'admin'

  const permissions = new Set<string>()
  const capabilities = new Set<Capability>()

  if (isAdmin) {
    applyRoleBaseCapabilities('admin', permissions, capabilities)
    // Base admin access is already established by the verified primary role.
    // Optional custom role labels must not make admins unavailable during an
    // unrelated custom-role table outage.
    const custom = await loadCustomGrants(client, userId).catch(() => ({ roleNames: [] }))
    return {
      primaryRole: effectivePrimary,
      allRoles,
      permissions,
      capabilities,
      customRoleNames: custom.roleNames,
      isAdmin: true,
    }
  }

  if (effectivePrimary) {
    const { data: rolePerms, error: rolePermsError } = await client
      .from('role_permissions')
      .select(PERMISSION_COLUMNS.join(', '))
      .eq('role', effectivePrimary as RolePermissionsRole)
      .maybeSingle()

    if (rolePermsError) {
      throw new Error(rolePermsError.message)
    }

    const merged = mergeRolePermissionsRow(rolePerms as RolePermissionsRow | null)
    merged.permissions.forEach((p) => permissions.add(p))
    merged.capabilities.forEach((c) => capabilities.add(c))
    applyRoleBaseCapabilities(effectivePrimary, permissions, capabilities)
  }

  const custom = await loadCustomGrants(client, userId)
  custom.permissions.forEach((p) => permissions.add(p))
  custom.capabilities.forEach((c) => capabilities.add(c))

  return {
    primaryRole: effectivePrimary,
    allRoles,
    permissions,
    capabilities,
    customRoleNames: custom.roleNames,
    isAdmin: false,
  }
}

export function hasPermissionKey(access: EffectiveAccess, permission: RolePermissionKey): boolean {
  if (access.isAdmin) return true
  return access.permissions.has(permission)
}