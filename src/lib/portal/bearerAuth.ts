/**
 * src/lib/portal/bearerAuth.ts
 *
 * Shared authentication for portal Route Handlers.
 *
 * Prefer Authorization: Bearer <access_token> so RLS sees auth.uid() via
 * createBearerAuthSupabaseClient.
 *
 * Cookie session is accepted as a dual-auth fallback (Phase C2) for legacy
 * portal clients (messages). Prefer Bearer for all new clients.
 */

import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/lib/errors'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import {
  createBearerAuthSupabaseClient,
  createServerSupabaseClient,
} from '@/lib/supabase/server'
import type { Artist } from '@/types'
import type { Database } from '@/types/database'

export interface PortalBearerAuth {
  token: string
  user: User
  supabase: SupabaseClient<Database>
}

export interface PortalBearerAuthWithArtist extends PortalBearerAuth {
  artist: Artist
}

/**
 * Authenticate a portal request via Bearer JWT, or fall back to cookie session.
 */
export async function authenticatePortalBearer(req: NextRequest): Promise<PortalBearerAuth> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim()
    if (!token) throw new ApiError(401, 'Missing authorization token')

    const authClient = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token)

    if (authError || !user) throw new ApiError(401, 'Invalid or expired token')

    const supabase = await createBearerAuthSupabaseClient(token)
    return { token, user, supabase }
  }

  // Cookie session fallback (dual-auth window for messages / older clients)
  const cookieClient = await createServerSupabaseClient()
  const {
    data: { user },
    error: cookieError,
  } = await cookieClient.auth.getUser()

  if (cookieError || !user) {
    throw new ApiError(401, 'Missing authorization token')
  }

  return { token: '', user, supabase: cookieClient }
}

export async function authenticatePortalBearerWithArtist(
  req: NextRequest,
  artistId?: string | null,
  options?: { requireArtistId?: boolean },
): Promise<PortalBearerAuthWithArtist> {
  // Default false: read/list may omit artistId (first membership). Mutations pass true.
  const requireArtistId = options?.requireArtistId === true
  const trimmed = typeof artistId === 'string' ? artistId.trim() : ''
  if (requireArtistId && !trimmed) {
    throw new ApiError(400, 'artistId is required')
  }

  const auth = await authenticatePortalBearer(req)
  const organizationId = await getRequestOrganizationId(auth.supabase)
  const artist = await resolvePortalArtist(
    auth.supabase,
    auth.user.id,
    trimmed || undefined,
    organizationId,
  ).catch((err) => {
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('FORBIDDEN')) throw new ApiError(403, 'No artist linked to this account')
    throw err
  })
  if (!artist) throw new ApiError(403, 'No artist linked to this account')
  return { ...auth, artist }
}
