/**
 * app/api/portal/messages/[id]/route.ts
 *
 * PATCH — star, mark read, move folder, soft-delete, restore.
 * Auth: Bearer (preferred) or cookie (dual-auth).
 * Membership: message may belong to sender or recipient artist — resolve
 * membership against either, then mutate via portalMemberWrite.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import {
  markPortalMessageRead,
  togglePortalMessageStar,
  movePortalMessage,
  softDeletePortalMessage,
  restorePortalMessage,
} from '@/lib/api/portalMessages'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { authenticatePortalBearer } from '@/lib/portal/bearerAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import {
  portalMemberWrite,
  type PortalMembershipContext,
} from '@/lib/portal/withPortalMembership'

const patchSchema = z.object({
  starred: z.boolean().optional(),
  markRead: z.boolean().optional(),
  folderId: z.string().uuid().nullable().optional(),
  deleted: z.boolean().optional(),
})

const ROUTE = 'PATCH /api/portal/messages/[id]'

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

export const PATCH = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { token, user, supabase: userDb } = await authenticatePortalBearer(req)
  const serviceDb = await createServiceRoleSupabaseClient()
  const messageId = extractId(req)

  const body: unknown = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues.map((e) => e.message).join('; ')
    throw new ApiError(400, message, 'VALIDATION_ERROR')
  }

  const { data: msg } = await serviceDb
    .from('portal_messages')
    .select('id, from_artist_id, to_artist_id')
    .eq('id', messageId)
    .maybeSingle()

  if (!msg) throw new ApiError(404, 'Message not found')

  const artistIds = [msg.from_artist_id, msg.to_artist_id].filter(Boolean) as string[]
  if (artistIds.length === 0) {
    throw new ApiError(403, 'Not authorized to update this message')
  }

  const { data: membership } = await serviceDb
    .from('artist_members')
    .select('artist_id')
    .in('artist_id', artistIds)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership?.artist_id) {
    throw new ApiError(403, 'Not authorized to update this message')
  }

  const organizationId = await getRequestOrganizationId(userDb)

  // Pin membership on sender or recipient artist (single auth path — no re-login)
  let artist
  try {
    artist = await resolvePortalArtist(userDb, user.id, membership.artist_id, organizationId)
  } catch (err) {
    const msgText = err instanceof Error ? err.message : ''
    if (msgText.startsWith('FORBIDDEN')) {
      throw new ApiError(403, 'Not authorized to update this message')
    }
    throw err
  }
  if (!artist) throw new ApiError(403, 'Not authorized to update this message')

  const ctx: PortalMembershipContext = {
    token,
    user,
    artist,
    organizationId,
    userDb,
    serviceDb,
  }

  const { starred, markRead, folderId, deleted } = parsed.data

  if (starred !== undefined) {
    await portalMemberWrite(
      ctx,
      { route: ROUTE, table: 'portal_messages', operation: 'update' },
      (db) => togglePortalMessageStar(db, messageId, starred),
    )
  }
  if (markRead === true) {
    await portalMemberWrite(
      ctx,
      { route: ROUTE, table: 'portal_messages', operation: 'update' },
      (db) => markPortalMessageRead(db, messageId, ctx.user.id),
    )
  }
  if (folderId !== undefined) {
    await portalMemberWrite(
      ctx,
      { route: ROUTE, table: 'portal_messages', operation: 'update' },
      (db) => movePortalMessage(db, messageId, folderId),
    )
  }
  if (deleted === true) {
    await portalMemberWrite(
      ctx,
      { route: ROUTE, table: 'portal_messages', operation: 'update' },
      (db) => softDeletePortalMessage(db, messageId),
    )
  } else if (deleted === false) {
    await portalMemberWrite(
      ctx,
      { route: ROUTE, table: 'portal_messages', operation: 'update' },
      (db) => restorePortalMessage(db, messageId),
    )
  }

  return NextResponse.json({ success: true })
})
