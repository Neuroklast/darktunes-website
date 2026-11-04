/**
 * POST /api/ai/conversations/{id}/cancellations
 * Same-instance turns abort immediately; serverless instances observe the DB
 * flag at the next round/tool checkpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import {
  getAiConversationForUser,
  assertConversationContext,
  requestAiConversationCancel,
} from '@/lib/api/aiConversations'
import { abortAiTurn, conversationTurnKey } from '@/lib/ai/orchestrator/abortRegistry'

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean)
  const id = parts[parts.length - 2] ?? ''
  if (!id) throw new ApiError(400, 'Missing conversation id')
  const dashboard = req.nextUrl.searchParams.get('dashboard')
  const actor = await requireAiActor(req, {
    artistId: req.nextUrl.searchParams.get('artist_id'),
    dashboard: dashboard === 'portal' || dashboard === 'editor' || dashboard === 'admin'
      ? dashboard
      : undefined,
  })
  const existing = await getAiConversationForUser(actor.serviceDb, id, actor.userId)
  assertConversationContext(existing, actor)
  await requestAiConversationCancel(actor.serviceDb, id, actor.userId)
  abortAiTurn(conversationTurnKey(id))
  return NextResponse.json({ cancelled: true }, { status: 202 })
})
