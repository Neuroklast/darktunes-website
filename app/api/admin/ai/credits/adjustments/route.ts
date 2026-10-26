import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { ApiError, withErrorHandler } from '@/lib/errors'

const schema = z.object({
  id: z.string().uuid(),
  scope: z.enum(['artist', 'editor', 'admin']),
  scope_id: z.string().min(1).max(80),
  delta_credits: z.number().int().min(-1000000).max(1000000).refine(value => value !== 0),
  reason: z.string().trim().min(3).max(500),
}).strict()

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { serviceClient, userId } = await requireAdminWithServiceClient(req)
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, 'Invalid credit adjustment.', 'VALIDATION_ERROR')
  const input = parsed.data
  if (input.scope === 'admin' && input.scope_id !== 'label') {
    throw new ApiError(400, 'Admin credits belong to the label account.', 'VALIDATION_ERROR')
  }
  if (input.scope !== 'admin') {
    if (!z.string().uuid().safeParse(input.scope_id).success) {
      throw new ApiError(400, 'A valid artist or user ID is required.', 'VALIDATION_ERROR')
    }
    const table = input.scope === 'artist' ? 'artists' : 'users'
    const { data, error } = await serviceClient.from(table).select('id').eq('id', input.scope_id).maybeSingle()
    if (error || !data) throw new ApiError(404, 'Credit account target not found.', 'NOT_FOUND')
  }
  const { data, error } = await serviceClient.rpc('adjust_ai_credits', {
    p_id: input.id, p_actor_id: userId, p_scope: input.scope,
    p_scope_id: input.scope_id, p_delta: input.delta_credits, p_reason: input.reason,
  })
  if (error) throw new ApiError(503, 'Credit adjustment failed.', 'AI_CREDITS_UNAVAILABLE')
  const result = data as { ok?: boolean; code?: string } | null
  if (!result?.ok) throw new ApiError(409, 'Adjustment would exceed the available credit balance.', 'AI_CREDITS_ADJUSTMENT_REJECTED')
  return NextResponse.json(result)
})
