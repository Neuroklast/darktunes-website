/**
 * Tour Planner portal auth — thin facade over membership write helpers.
 * All tour-planner routes keep calling this; membership + service-role canary
 * live behind withPortalMembershipWrite / serviceDb after membership pin.
 */

import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import type { TourPlannerSettings } from '@/lib/tour-planner/types'
import type { Database } from '@/types/database'
import type { PortalBearerAuthWithArtist } from '@/lib/portal/bearerAuth'
import { withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'

export async function assertTourPlannerEnabled(
  supabase: SupabaseClient<Database>,
  organizationId?: string,
): Promise<void> {
  const orgId = organizationId ?? (await getRequestOrganizationId().catch(() => undefined))
  const flags = await getFeatureFlagsForRole(supabase, 'artist', orgId)
  if (flags['artist.tour_planner'] === false) {
    throw new ApiError(403, 'Tour Planner is disabled for this account')
  }
}

/**
 * Authenticate + pin artist membership for Tour Planner routes.
 * Returns a PortalBearerAuthWithArtist-compatible shape; `supabase` is the
 * service-role client after membership (band-member safe writes).
 */
export async function authenticateTourPlannerRequest(
  req: NextRequest,
  artistId?: string | null,
): Promise<PortalBearerAuthWithArtist> {
  const ctx = await withPortalMembershipWrite(req, artistId)
  await assertTourPlannerEnabled(ctx.serviceDb)
  return {
    token: ctx.token,
    user: ctx.user,
    supabase: ctx.serviceDb,
    artist: ctx.artist,
  }
}

export function resolveGoogleMapsApiKey(settings?: TourPlannerSettings): string | undefined {
  return settings?.googleApiKey ?? process.env.GOOGLE_MAPS_API_KEY
}

export {
  assertTourAccess,
  assertTourOwner,
  assertValidPerformingArtists,
  getTourAccess,
  getTourRosterArtistIds,
} from '@/lib/api/tourAccess'
export type { TourAccess, TourAccessRole } from '@/lib/api/tourAccess'
