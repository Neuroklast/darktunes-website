/**
 * GET    /api/ai/conversations/{id}
 * PATCH  /api/ai/conversations/{id}
 * DELETE /api/ai/conversations/{id}
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import {
  assertConversationContext,
  deleteAiConversation,
  getAiConversationForUser,
  listAiMessagesPage,
  markStaleAiTurnFailed,
  renameAiConversation,
} from '@/lib/api/aiConversations'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({ title: z.string().min(1).max(120) })

function conversationIdFrom(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const id = conversationIdFrom(req)
  if (!id) throw new ApiError(400, 'Missing conversation id')
  const dashboard = parseDashboard(req.nextUrl.searchParams.get('dashboard'))
  const actor = await requireAiActor(req, {
    artistId: req.nextUrl.searchParams.get('artist_id'),
    dashboard,
  })
  const loaded = await getAiConversationForUser(actor.serviceDb, id, actor.userId)
  assertConversationContext(loaded, actor)
  const conversation = await markStaleAiTurnFailed(actor.serviceDb, loaded)
  const page = await listAiMessagesPage(actor.serviceDb, conversation.id, {
    before: req.nextUrl.searchParams.get('before'),
    limit: Number(req.nextUrl.searchParams.get('page_size') ?? 40) || 40,
  })
  return NextResponse.json({
    id: conversation.id,
    user_id: conversation.userId,
    artist_id: conversation.artistId,
    access_context: conversation.accessContext,
    title: conversation.title,
    status: conversation.status,
    active_request_id: conversation.activeRequestId,
    active_request_started_at: conversation.activeRequestStartedAt,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    messages: [...page.items].reverse().map(serializeMessage),
    next_cursor: page.next_cursor,
  })
})

export const PATCH = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const id = conversationIdFrom(req)
  if (!id) throw new ApiError(400, 'Missing conversation id')
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) throw new ApiError(400, 'Invalid conversation title', 'VALIDATION_ERROR')
  const actor = await requireAiActor(req)
  const conversation = await renameAiConversation(
    actor.serviceDb,
    id,
    actor.userId,
    parsed.data.title,
  )
  return NextResponse.json({
    id: conversation.id,
    title: conversation.title,
    updated_at: conversation.updatedAt,
  })
})

export const DELETE = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const id = conversationIdFrom(req)
  if (!id) throw new ApiError(400, 'Missing conversation id')
  const actor = await requireAiActor(req)
  await deleteAiConversation(actor.serviceDb, id, actor.userId)
  return new NextResponse(null, { status: 204 })
})

function serializeMessage(message: {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  model: string | null
  status: string
  toolCalls: Array<{ id: string; name: string; arguments: string }>
  toolCallId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.role === 'tool' ? '' : message.content,
    model: message.model,
    status: message.status,
    tool_calls:
      message.role === 'assistant'
        ? message.toolCalls.map((call) => ({ id: call.id, name: call.name }))
        : [],
    tool_call_id: message.toolCallId,
    metadata: safeMetadata(message.metadata),
    created_at: message.createdAt,
  }
}

function safeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const allowed = [
    'tool_name',
    'ok',
    'duration_ms',
    'available',
    'turn_status',
    'error_code',
    'finish_reason',
    'fallback_used',
  ]
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in metadata) out[key] = metadata[key]
  }
  return out
}

function parseDashboard(value: string | null): 'portal' | 'editor' | 'admin' | undefined {
  if (value === 'portal' || value === 'editor' || value === 'admin') return value
  return undefined
}
