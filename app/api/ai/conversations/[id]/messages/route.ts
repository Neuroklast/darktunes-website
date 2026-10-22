/**
 * POST /api/ai/conversations/{id}/messages
 * Streams assistant events as SSE.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, buildApiError, handleRouteError, withErrorHandler } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { runAiTurn } from '@/lib/ai/orchestrator/runTurn'
import { encodeSse, sseHeaders } from '@/lib/ai/orchestrator/sse'
import { checkDistributedRateLimit } from '@/lib/rateLimitDistributed'

export const maxDuration = 120

const dashboardSchema = z.enum(['portal', 'editor', 'admin'])
const modeSchema = z.enum(['auto', 'fast', 'deep'])
const bodySchema = z.object({
  content: z.string().min(1).max(8000),
  artist_id: z.string().uuid().nullable().optional(),
  dashboard: dashboardSchema.optional(),
  mode: modeSchema.optional(),
  reuse_last_user: z.boolean().optional(),
  locale: z.enum(['en', 'de', 'fr']).optional(),
  page: z
    .object({
      dashboard: dashboardSchema,
      path: z.string().max(200),
      locale: z.enum(['en', 'de', 'fr']),
    })
    .optional(),
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const parts = req.nextUrl.pathname.split('/').filter(Boolean)
  const conversationId = parts[parts.length - 2] ?? ''
  if (!conversationId) throw new ApiError(400, 'Missing conversation id')

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) throw new ApiError(400, 'Invalid message payload', 'VALIDATION_ERROR')

  const dashboard = parsed.data.dashboard ?? parsed.data.page?.dashboard
  const actor = await requireAiActor(req, {
    artistId: parsed.data.artist_id,
    dashboard,
  })
  const limited = await checkDistributedRateLimit(`ai-turn:${actor.userId}`, 20, 10 * 60 * 1000)
  if (limited.limited) throw buildApiError('RATE_LIMITED', 429)

  const requestId = crypto.randomUUID()
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  req.signal.addEventListener('abort', onAbort, { once: true })
  if (req.signal.aborted) controller.abort()

  const stream = new ReadableStream({
    async start(streamController) {
      const encoder = new TextEncoder()
      try {
        for await (const event of runAiTurn({
          actor,
          conversationId,
          userText: parsed.data.content,
          page: parsed.data.page,
          locale: parsed.data.locale ?? parsed.data.page?.locale ?? 'en',
          requestId,
          mode: parsed.data.mode,
          reuseLastUser: parsed.data.reuse_last_user,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break
          streamController.enqueue(encoder.encode(encodeSse(event)))
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const mapped = handleRouteError(req, error)
          const body = (await mapped.json()) as { code?: string; detail?: string; error?: string }
          try {
            streamController.enqueue(
              encoder.encode(
                encodeSse({
                  type: 'error',
                  code: body.code ?? 'SERVER_ERROR',
                  detail: body.detail ?? body.error ?? 'The assistant could not complete this turn.',
                  retryable: false,
                }),
              ),
            )
          } catch {
            // The client disconnected while the error was being written.
          }
        }
      } finally {
        req.signal.removeEventListener('abort', onAbort)
        try {
          streamController.close()
        } catch {
          // Already closed by the client.
        }
      }
    },
    cancel() {
      controller.abort()
    },
  })
  return new NextResponse(stream, { headers: sseHeaders() })
})
