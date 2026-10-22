import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import { authenticatePortalBearer } from '@/lib/portal/bearerAuth'
import {
  getArtistOptionById,
  listArtistMemberships,
  listArtistOptions,
  type ArtistOption,
} from '@/lib/api/artistProfiles'
import { resolveEffectiveAccess } from '@/lib/rbac/resolveAccess'
import type { Capability } from '@/lib/rbac/types'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import type { BudgetRole } from '@/lib/ai/budget/manager'
import {
  resolveAiContext,
  type AiAccessContext,
  type AiDashboard,
} from '@/lib/ai/auth/resolveContext'

export type { AiAccessContext, AiDashboard }

export interface AiActor {
  userId: string
  role: BudgetRole
  accessContext: AiAccessContext
  dashboard: AiDashboard
  artistId: string | null
  artistMembershipIds: string[]
  capabilities: Set<Capability>
  availableArtists: ArtistOption[]
  serviceDb: SupabaseClient<Database>
  userDb: SupabaseClient<Database>
}

/** Existing callers may pass only an artist while routes migrate to dashboards. */
export interface RequireAiActorOptions {
  artistId?: string | null
  dashboard?: AiDashboard
  requireArtist?: boolean
  /** Load the full artist option list (context selector). Off by default. */
  includeArtists?: boolean
}

const MANAGE_ARTISTS: Capability = 'cms.artists.manage'

export async function requireAiActor(
  req: NextRequest,
  options?: RequireAiActorOptions,
): Promise<AiActor> {
  const { user, supabase: userDb } = await authenticatePortalBearer(req)
  const serviceDb = await createServiceRoleSupabaseClient()
  const access = await resolveEffectiveAccess(serviceDb, user.id)
  const role = toBudgetRole(access.primaryRole)
  if (!role) {
    throw new ApiError(403, 'The AI assistant is only available to artists, editors, and admins.', 'FORBIDDEN')
  }

  const dashboard: AiDashboard =
    options?.dashboard ?? (role === 'artist' ? 'portal' : 'admin')
  const memberships = await listArtistMemberships(serviceDb, user.id).catch(async () => {
    return listArtistMemberships(userDb, user.id)
  })
  const canInspectAnyArtist = role === 'admin' || (role === 'editor' && access.capabilities.has(MANAGE_ARTISTS))
  const allArtists =
    canInspectAnyArtist && options?.includeArtists === true
      ? await listArtistOptions(serviceDb).catch(() => [] as ArtistOption[])
      : null

  const requestedArtistId = options?.artistId?.trim() || null
  const requestedIsMember = requestedArtistId
    ? memberships.some((artist) => artist.id === requestedArtistId)
    : false
  const requestedArtist =
    requestedArtistId && !requestedIsMember && canInspectAnyArtist
      ? await getArtistOptionById(serviceDb, requestedArtistId).catch(() => null)
      : null

  const resolved = resolveAiContext({
    userId: user.id,
    role,
    dashboard,
    requestedArtistId,
    memberships,
    allArtists,
    capabilities: access.capabilities,
    requestedArtist,
  })
  if (resolved.error) {
    throw new ApiError(resolved.error.status, resolved.error.message, resolved.error.code)
  }
  if (options?.requireArtist && !resolved.artistId) {
    throw new ApiError(403, 'No artist selected for this request.', 'FORBIDDEN_NO_ARTIST')
  }

  return {
    userId: user.id,
    role,
    accessContext: resolved.accessContext,
    dashboard,
    artistId: resolved.artistId,
    artistMembershipIds: resolved.artistMembershipIds,
    capabilities: access.capabilities,
    availableArtists: resolved.availableArtists,
    serviceDb,
    userDb,
  }
}

function toBudgetRole(role: string | null): BudgetRole | null {
  return role === 'admin' || role === 'editor' || role === 'artist' ? role : null
}
