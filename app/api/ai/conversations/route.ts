/**
 * GET  /api/ai/conversations — list the caller's conversations
 * POST /api/ai/conversations — create a conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, buildApiError, withErrorHandler } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { createAiConversation, listAiConversations } from '@/lib/api/aiConversations'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'

export const dynamic = 'force-dynamic'

const dashboardSchema = z.enum(['portal', 'editor', 'admin'])
const createSchema = z.object({
  artist_id: z.string().uuid().nullable().optional(),
  dashboard: dashboardSchema.optional(),
  title: z.string().max(120).optional(),
})

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const artistId = req.nextUrl.searchParams.get('artist_id')
  const dashboard = parseDashboard(req.nextUrl.searchParams.get('dashboard'))
  const actor = await requireAiActor(req, { artistId, dashboard })
  const listed = await listAiConversations(actor.serviceDb, {
    userId: actor.userId,
    artistId: actor.artistId,
    accessContext: actor.accessContext,
    cursor: req.nextUrl.searchParams.get('cursor'),
    limit: Number(req.nextUrl.searchParams.get('page_size') ?? 40) || 40,
  })
  return NextResponse.json({
    ...listed,
    context: {
      access_context: actor.accessContext,
      artist_id: actor.artistId,
      dashboard: actor.dashboard,
    },
  })
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) throw new ApiError(400, 'Invalid conversation payload', 'VALIDATION_ERROR')

  const actor = await requireAiActor(req, {
    artistId: parsed.data.artist_id,
    dashboard: parsed.data.dashboard,
  })
  const limited = await checkDistributedRateLimit(`ai-conversations:${actor.userId}`, 30, 10 * 60 * 1000)
  if (limited.limited) throw buildApiError('RATE_LIMITED', 429)

  const conversation = await createAiConversation(actor.serviceDb, {
    userId: actor.userId,
    artistId: actor.artistId,
    accessContext: actor.accessContext,
    title: parsed.data.title,
  })
  return NextResponse.json(
    {
      id: conversation.id,
      user_id: conversation.userId,
      artist_id: conversation.artistId,
      access_context: conversation.accessContext,
      title: conversation.title,
      status: conversation.status,
      created_at: conversation.createdAt,
      updated_at: conversation.updatedAt,
    },
    { status: 201, headers: { Location: `/api/ai/conversations/${conversation.id}` } },
  )
})

function parseDashboard(value: string | null): 'portal' | 'editor' | 'admin' | undefined {
  if (value === 'portal' || value === 'editor' || value === 'admin') return value
  return undefined
}
