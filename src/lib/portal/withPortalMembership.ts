/**
 * src/lib/portal/withPortalMembership.ts
 *
 * Single entry for portal mutation handlers:
 *   Bearer auth → resolve membership → userDb + serviceDb
 *
 * Prefer this over ad-hoc authenticatePortalBearer + resolvePortalArtist
 * so membership checks cannot be forgotten on write routes.
 */

import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { authenticatePortalBearer } from '@/lib/portal/bearerAuth'
import {
  portalWriteWithCanary,
  type PortalDb,
  type PortalWriteResult,
} from '@/lib/portal/portalWriteClient'
import type { Artist } from '@/types'
import type { Database } from '@/types/database'

export interface PortalMembershipContext {
  token: string
  user: User
  artist: Artist
  /** Host organization for this portal request (multi-tenant). */
  organizationId: string
  /** JWT-scoped client (auth.uid() set) — use for membership reads and canary user path */
  userDb: SupabaseClient<Database>
  /** Service-role client — canary default / privileged side effects */
  serviceDb: SupabaseClient<Database>
}

/**
 * Authenticate the portal Bearer token and resolve the active artist membership.
 *
 * @param options.requireArtistId — when true (default for write helpers), missing
 *   artistId throws 400 instead of falling back to the first membership.
 * @throws ApiError 400/401/403
 */
export async function withPortalMembership(
  req: NextRequest,
  artistId?: string | null,
  options?: { requireArtistId?: boolean },
): Promise<PortalMembershipContext> {
  // Default false preserves list/read fallbacks; write routes must pass requireArtistId: true
  // or use withPortalMembershipWrite().
  const requireArtistId = options?.requireArtistId === true
  const trimmed = typeof artistId === 'string' ? artistId.trim() : ''
  if (requireArtistId && !trimmed) {
    throw new ApiError(400, 'artistId is required')
  }

  const { token, user, supabase: userDb } = await authenticatePortalBearer(req)
  const organizationId = await getRequestOrganizationId(userDb)

  let artist: Artist | null
  try {
    artist = await resolvePortalArtist(userDb, user.id, trimmed || undefined, organizationId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('FORBIDDEN')) {
      throw new ApiError(403, 'No artist linked to this account')
    }
    throw err
  }
  if (!artist) throw new ApiError(403, 'No artist linked to this account')

  const serviceDb = await createServiceRoleSupabaseClient()

  return {
    token,
    user,
    artist,
    organizationId,
    userDb,
    serviceDb,
  }
}

/**
 * Same as withPortalMembership but requires artistId (alias for write routes).
 */
export async function withPortalMembershipWrite(
  req: NextRequest,
  artistId?: string | null,
): Promise<PortalMembershipContext> {
  return withPortalMembership(req, artistId, { requireArtistId: true })
}

/**
 * Membership-scoped write using the dual-path canary (see portalWriteClient).
 * Always call after withPortalMembership — never without membership.
 */
export async function portalMemberWrite<T>(
  ctx: PortalMembershipContext,
  meta: {
    route: string
    table: string
    operation: string
  },
  write: (db: PortalDb) => Promise<T>,
): Promise<PortalWriteResult<T>> {
  return portalWriteWithCanary({
    userDb: ctx.userDb,
    serviceDb: ctx.serviceDb,
    context: {
      route: meta.route,
      table: meta.table,
      operation: meta.operation,
      artistId: ctx.artist.id,
      userId: ctx.user.id,
    },
    write,
  })
}
