/**
 * POST /api/portal/messages/artist-reply
 * Artist replies to a label_message. Notifies staff (admin/editor bell).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { portalMemberWrite, withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'
import { sendArtistReply } from '@/lib/api/artistReplies'
import { emitNotification } from '@/lib/notifications'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'
import { getClientIp } from '@/lib/ipRateLimit'
import { PORTAL_MESSAGE_SEND_RATE } from '@/lib/uploads/portalUploadLimits'

const bodySchema = z.object({
  artistId: z.string().uuid(),
  messageId: z.string().uuid(),
  body: z.string().min(1).max(50_000),
  bodyHtml: z.string().max(200_000).optional().nullable(),
})

const ROUTE = 'POST /api/portal/messages/artist-reply'

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const json: unknown = await req.json()
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((i) => i.message).join('; '), 'VALIDATION_ERROR')
  }

  const { artistId, messageId, body, bodyHtml } = parsed.data
  const ctx = await withPortalMembershipWrite(req, artistId)

  const ip = getClientIp(req)
  const rl = await checkDistributedRateLimit(
    `artist-reply:${ctx.user.id}:${ip}`,
    PORTAL_MESSAGE_SEND_RATE.max,
    PORTAL_MESSAGE_SEND_RATE.windowMs,
  )
  if (rl.limited) {
    throw new ApiError(429, 'Too many messages. Please wait and try again.')
  }

  // Ensure the parent label message belongs to this artist
  const { value: parent } = await portalMemberWrite(
    ctx,
    { route: ROUTE, table: 'label_messages', operation: 'select' },
    async (db) => {
      const { data, error } = await db
        .from('label_messages')
        .select('id, artist_id, subject')
        .eq('id', messageId)
        .eq('artist_id', artistId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  )
  if (!parent) {
    throw new ApiError(404, 'Message not found')
  }

  const { value: reply } = await portalMemberWrite(
    ctx,
    { route: ROUTE, table: 'artist_replies', operation: 'insert' },
    (db) => sendArtistReply(db, messageId, artistId, body, bodyHtml ?? undefined),
  )

  const artistName = ctx.artist.name ?? 'Artist'
  try {
    await emitNotification(ctx.serviceDb, {
      type: 'artist_portal_message',
      entityType: 'artist_reply',
      entityId: reply.id,
      entityName: `${artistName}: Re: ${parent.subject}`,
      senderId: ctx.user.id,
      artistId,
      dedupeKey: `artist_reply:${reply.id}`,
    })
  } catch (err) {
    console.error('[portal/messages/artist-reply] emit failed:', err)
  }

  return NextResponse.json({ reply }, { status: 201 })
})
