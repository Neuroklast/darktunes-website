/**
 * POST /api/admin/messages/send
 * Label → artist message(s). Emits `label_message` notifications to artist members.
 * Auth: admin or editor (Bearer or cookie).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { sendLabelMessagesToArtists } from '@/lib/messaging/send'
import { emitNotification } from '@/lib/notifications/emit'

const bodySchema = z.object({
  artistIds: z.array(z.string().uuid()).min(1).max(200),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50_000),
  bodyHtml: z.string().max(200_000).optional().nullable(),
  clientMessageId: z.string().uuid().optional().nullable(),
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const auth = await requireAdminOrEditorFromRequest(req)
  const json: unknown = await req.json()
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((i) => i.message).join('; '), 'VALIDATION_ERROR')
  }

  const { artistIds, subject, body, bodyHtml, clientMessageId } = parsed.data
  const serviceDb = await createServiceRoleSupabaseClient()

  const messages = await sendLabelMessagesToArtists(serviceDb, {
    artistIds,
    subject,
    body,
    bodyHtml: bodyHtml ?? undefined,
    senderUserId: auth.userId,
    clientMessageId: clientMessageId ?? null,
  })

  // Notify each artist’s members (dedupe per message row)
  await Promise.all(
    messages.map(async (message) => {
      try {
        await emitNotification(serviceDb, {
          type: 'label_message',
          entityId: message.id,
          entityName: subject,
          senderId: auth.userId,
          artistId: message.artistId,
          dedupeKey: `label_message:${message.id}`,
        })
      } catch (err) {
        console.error('[admin/messages/send] emit failed:', err)
      }
    }),
  )

  return NextResponse.json({ messages, count: messages.length }, { status: 201 })
})
