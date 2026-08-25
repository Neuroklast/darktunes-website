/**
 * src/lib/adminAuth.ts
 *
 * Shared server-side helpers for verifying admin/editor access
 * in Next.js Route Handlers.
 *
 * Preferred (Phase D):
 *   const { userId } = await requireAdminFromRequest(req)
 *   // or requireAdminOrEditorFromRequest(req)
 *
 * Legacy token-only:
 *   const token = extractBearerToken(req.headers.get('authorization'))
 *   await verifyAdminOrEditor(token)
 *
 * Dual auth: Bearer first, then cookie session (admin UI often uses cookies).
 *
 * Permission checks merge system `role_permissions` with supplemental custom roles
 * via `resolveEffectiveAccess` from `src/lib/rbac/`.
 */

import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import type { Database } from '@/types/database'
import type { UserRole } from '@/types/users'
import { getUserRoleWithClient } from '@/lib/getUserRole'
import { resolveEffectiveAccess, hasPermissionKey } from '@/lib/rbac/resolveAccess'
import { hasSyncTriggerAccess } from '@/lib/rbac/guards'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { assertAdminOrganizationAccess } from '@/lib/organizations/assertAdminOrganizationAccess'

/** Granular permission keys from the role_permissions table. */
export type RolePermissionKey =
  | 'can_publish_news'
  | 'can_edit_news'
  | 'can_manage_artists'
  | 'can_manage_releases'
  | 'can_manage_videos'
  | 'can_view_admin_panel'

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new ApiError(500, 'Supabase service key not configured')
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  })
}

async function authenticateBearerToken(token: string): Promise<{
  userId: string
  client: ReturnType<typeof createServiceRoleClient>
}> {
  const client = createServiceRoleClient()
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) {
    throw new ApiError(401, 'Unauthorized')
  }
  return { userId: userData.user.id, client }
}

/**
 * Parses a Bearer Authorization header.
 *
 * @throws ApiError(401) if the header is absent or does not start with "Bearer ".
 */
export function extractBearerToken(authHeader: string | null): string {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(401, 'Missing or invalid Authorization header')
  }
  return authHeader.slice(7)
}

/**
 * Verifies that the supplied Supabase access-token belongs to a user with
 * the `admin` or `editor` role.
 */
export async function verifyAdminOrEditor(token: string): Promise<string> {
  const { userId, client } = await authenticateBearerToken(token)
  const role = await getUserRoleWithClient(client, userId)

  if (!role || !['admin', 'editor'].includes(role)) {
    throw new ApiError(403, 'Forbidden')
  }

  return userId
}

/**
 * Verifies that the supplied Supabase access-token belongs to a user with
 * the `admin` role specifically.
 */
export async function verifyAdmin(token: string): Promise<string> {
  const { userId, client } = await authenticateBearerToken(token)
  const role = await getUserRoleWithClient(client, userId)

  if (role !== 'admin') {
    throw new ApiError(403, 'Forbidden: admin role required')
  }

  return userId
}

/**
 * Verifies admin or editor access for sync endpoints (admin, editor, or custom
 * `sync.trigger` capability).
 */
export async function verifySyncTrigger(token: string): Promise<string> {
  const { userId, client } = await authenticateBearerToken(token)
  const role = await getUserRoleWithClient(client, userId)

  if (role === 'admin' || role === 'editor') {
    return userId
  }

  const access = await resolveEffectiveAccess(client, userId)
  if (!hasSyncTriggerAccess(access)) {
    throw new ApiError(403, 'Forbidden')
  }

  return userId
}

/**
 * Verifies that the token holder has the specified granular permission.
 * Admin always passes. Custom roles can grant supplemental permission keys.
 */
export async function verifyPermission(
  token: string,
  permission: RolePermissionKey,
): Promise<string> {
  const { userId, client } = await authenticateBearerToken(token)

  let access: Awaited<ReturnType<typeof resolveEffectiveAccess>>
  try {
    access = await resolveEffectiveAccess(client, userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve permissions'
    throw new ApiError(500, message)
  }

  if (!hasPermissionKey(access, permission)) {
    throw new ApiError(403, `Forbidden: missing permission '${permission}'`)
  }

  return userId
}

// ---------------------------------------------------------------------------
// Request-level helpers (Phase D — Bearer + cookie dual auth)
// ---------------------------------------------------------------------------

export interface AdminRequestAuth {
  userId: string
  role: UserRole
  /** Host-bound organization for this request (multi-tenant). */
  organizationId: string
}

/**
 * Resolve the caller from Bearer JWT or cookie session, then enforce role.
 *
 * Important: a **stale/expired Bearer must not block cookie fallback**.
 * Admin UI often sends an in-memory access token that expires while the
 * refresh cookie session is still valid — storage-stats and other dual-auth
 * routes were 401ing with a wrong/empty storage bar when only Bearer failed.
 */
export async function verifyAdminRequest(
  req: NextRequest,
  options?: { adminOnly?: boolean },
): Promise<AdminRequestAuth> {
  const adminOnly = options?.adminOnly === true
  const authHeader = req.headers.get('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = extractBearerToken(authHeader)
      const userId = adminOnly ? await verifyAdmin(token) : await verifyAdminOrEditor(token)
      const client = createServiceRoleClient()
      const role = await getUserRoleWithClient(client, userId)
      if (!role) throw new ApiError(403, 'Forbidden')
      const organizationId = await getRequestOrganizationId(client)
      await assertAdminOrganizationAccess(client, userId, organizationId)
      return { userId, role, organizationId }
    } catch (err) {
      // Only fall through for auth failures (401). 403 stays hard (wrong role).
      if (!(err instanceof ApiError) || err.status !== 401) throw err
    }
  }

  // Cookie session fallback (admin UI often omits Bearer, or Bearer is stale)
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new ApiError(401, 'Unauthorized')

  const role = await getUserRoleWithClient(supabase, user.id)
  if (!role) throw new ApiError(403, 'Forbidden')

  if (adminOnly) {
    if (role !== 'admin') throw new ApiError(403, 'Forbidden: admin role required')
  } else if (!['admin', 'editor'].includes(role)) {
    throw new ApiError(403, 'Forbidden')
  }

  const serviceClient = createServiceRoleClient()
  const organizationId = await getRequestOrganizationId(serviceClient)
  await assertAdminOrganizationAccess(serviceClient, user.id, organizationId)

  return { userId: user.id, role, organizationId }
}

/** Admin-only. Prefer for user management, SOS accounting, feature flags. */
export async function requireAdminFromRequest(req: NextRequest): Promise<AdminRequestAuth> {
  return verifyAdminRequest(req, { adminOnly: true })
}

/** Admin or editor. */
export async function requireAdminOrEditorFromRequest(
  req: NextRequest,
): Promise<AdminRequestAuth> {
  return verifyAdminRequest(req, { adminOnly: false })
}

/**
 * Admin-only + service-role client — common pattern for user/invite/SOS routes.
 */
export async function requireAdminWithServiceClient(req: NextRequest): Promise<{
  userId: string
  role: UserRole
  organizationId: string
  serviceClient: Awaited<ReturnType<typeof createServiceRoleSupabaseClient>>
}> {
  const auth = await requireAdminFromRequest(req)
  const serviceClient = await createServiceRoleSupabaseClient()
  return {
    userId: auth.userId,
    role: auth.role,
    organizationId: auth.organizationId,
    serviceClient,
  }
}