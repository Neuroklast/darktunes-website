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
  requestAiConversationCancel,
} from '@/lib/api/aiConversations'
import { abortAiTurn, conversationTurnKey } from '@/lib/ai/orchestrator/abortRegistry'

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean)
  const id = parts[parts.length - 2] ?? ''
  if (!id) throw new ApiError(400, 'Missing conversation id')
  const actor = await requireAiActor(req)
  await getAiConversationForUser(actor.serviceDb, id, actor.userId)
  await requestAiConversationCancel(actor.serviceDb, id, actor.userId)
  abortAiTurn(conversationTurnKey(id))
  return NextResponse.json({ cancelled: true }, { status: 202 })
})
