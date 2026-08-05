/**
 * GET  /api/portal/feedback?artistId= — list own feedback history
 * POST /api/portal/feedback — submit product feedback
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import {
  createPortalFeedback,
  listPortalFeedbackByArtist,
  PORTAL_FEEDBACK_CATEGORIES,
  PORTAL_FEEDBACK_MESSAGE_MAX,
  PORTAL_FEEDBACK_MESSAGE_MIN,
  PORTAL_FEEDBACK_RATE_MAX,
  PORTAL_FEEDBACK_RATE_WINDOW_MS,
  PORTAL_FEEDBACK_SUBJECT_MAX,
} from '@/lib/api/portalFeedback'
import { portalMemberWrite, withPortalMembershipWrite } from '@/lib/portal/withPortalMembership'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'
import { getClientIp } from '@/lib/ipRateLimit'

const createBodySchema = z.object({
  artistId: z.string().uuid().optional(),
  category: z.enum(PORTAL_FEEDBACK_CATEGORIES),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  subject: z
    .string()
    .trim()
    .max(PORTAL_FEEDBACK_SUBJECT_MAX)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  message: z
    .string()
    .trim()
    .min(PORTAL_FEEDBACK_MESSAGE_MIN)
    .max(PORTAL_FEEDBACK_MESSAGE_MAX),
})

function artistIdFromReq(req: NextRequest, bodyArtistId?: string | null): string | null {
  return (
    bodyArtistId ??
    req.nextUrl.searchParams.get('artistId') ??
    new URL(req.url).searchParams.get('artistId')
  )
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const artistId = artistIdFromReq(req)
  const ctx = await withPortalMembershipWrite(req, artistId)

  const { value: items } = await portalMemberWrite(
    ctx,
    { route: 'GET /api/portal/feedback', table: 'portal_feedback', operation: 'select' },
    (db) => listPortalFeedbackByArtist(db, ctx.artist.id, { limit: 50 }),
  )

  return NextResponse.json({ items })
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  const parsed = createBodySchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid feedback payload')
  }

  const artistId = artistIdFromReq(req, parsed.data.artistId)
  const ctx = await withPortalMembershipWrite(req, artistId)

  const ip = getClientIp(req)
  const rl = await checkDistributedRateLimit(
    `portal-feedback:${ctx.user.id}:${ip}`,
    PORTAL_FEEDBACK_RATE_MAX,
    PORTAL_FEEDBACK_RATE_WINDOW_MS,
  )
  if (rl.limited) {
    throw new ApiError(429, 'Too many feedback submissions. Please try again later.')
  }

  const { value: created } = await portalMemberWrite(
    ctx,
    { route: 'POST /api/portal/feedback', table: 'portal_feedback', operation: 'insert' },
    (db) =>
      createPortalFeedback(db, {
        artist_id: ctx.artist.id,
        user_id: ctx.user.id,
        category: parsed.data.category,
        rating: parsed.data.rating ?? null,
        subject: parsed.data.subject,
        message: parsed.data.message,
        status: 'new',
      }),
  )

  return NextResponse.json(created, { status: 201 })
})
