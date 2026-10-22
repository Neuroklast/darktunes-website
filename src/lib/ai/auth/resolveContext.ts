import type { ArtistOption } from '@/lib/api/artistProfiles'
import type { Capability } from '@/lib/rbac/types'
import type { BudgetRole } from '@/lib/ai/budget/manager'

export type AiAccessContext = 'artist' | 'editor' | 'admin'
export type AiDashboard = 'portal' | 'editor' | 'admin'

export interface ResolveAiContextInput {
  userId: string
  role: BudgetRole
  dashboard: AiDashboard
  requestedArtistId: string | null
  memberships: ArtistOption[]
  /** Populated for admins and editors with `cms.artists.manage`. */
  allArtists?: ArtistOption[] | null
  capabilities: Set<Capability>
  /** Result of a server-side lookup when the requested artist is not a membership. */
  requestedArtist?: ArtistOption | null
}

export interface ResolvedAiContext {
  accessContext: AiAccessContext
  artistId: string | null
  availableArtists: ArtistOption[]
  artistMembershipIds: string[]
  error: { status: number; code: string; message: string } | null
}

const CAN_MANAGE_ARTISTS: Capability = 'cms.artists.manage'

/**
 * Pure context resolution. The caller resolves memberships and (when allowed)
 * an explicitly requested artist from the database first; URL parameters never
 * grant authorization on their own.
 */
export function resolveAiContext(input: ResolveAiContextInput): ResolvedAiContext {
  const membershipIds = input.memberships.map((artist) => artist.id)
  const canInspectAnyArtist =
    input.role === 'admin' || (input.role === 'editor' && input.capabilities.has(CAN_MANAGE_ARTISTS))
  const availableArtists = canInspectAnyArtist
    ? mergeArtists(input.memberships, input.allArtists ?? [])
    : input.memberships

  let activeArtist: ArtistOption | null = null
  if (input.requestedArtistId) {
    const membership = input.memberships.find((artist) => artist.id === input.requestedArtistId)
    if (membership) {
      activeArtist = membership
    } else if (canInspectAnyArtist) {
      if (!input.requestedArtist) {
        return {
          accessContext: input.role,
          artistId: null,
          availableArtists,
          artistMembershipIds: membershipIds,
          error: {
            status: 404,
            code: 'AI_ARTIST_INVALID',
            message: 'That artist was not found. Select an existing artist.',
          },
        }
      }
      activeArtist = input.requestedArtist
    } else {
      return {
        accessContext: input.role,
        artistId: null,
        availableArtists,
        artistMembershipIds: membershipIds,
        error: {
          status: 403,
          code: 'AI_ARTIST_FORBIDDEN',
          message: 'You cannot use that artist context. Select an artist linked to your account.',
        },
      }
    }
  } else if (input.dashboard === 'portal' && input.memberships.length > 0) {
    activeArtist = input.memberships[0] ?? null
  }

  // A portal request with an artist membership is an artist conversation even
  // when an admin/editor is visiting the portal. Their billing role is kept.
  const accessContext: AiAccessContext =
    input.dashboard === 'portal' && activeArtist ? 'artist' : input.role

  return {
    accessContext,
    artistId: activeArtist?.id ?? null,
    availableArtists: mergeArtists(availableArtists, activeArtist ? [activeArtist] : []),
    artistMembershipIds: membershipIds,
    error: null,
  }
}

function mergeArtists(primary: ArtistOption[], extra: ArtistOption[]): ArtistOption[] {
  const map = new Map<string, ArtistOption>()
  for (const artist of primary) map.set(artist.id, artist)
  for (const artist of extra) map.set(artist.id, artist)
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
