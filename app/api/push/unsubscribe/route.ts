/**
 * POST /api/push/unsubscribe
 * Remove a Web Push subscription for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { deletePushSubscriptionByEndpoint } from '@/lib/push/subscriptions'

const bodySchema = z.object({
  endpoint: z.string().url().max(2048),
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new ApiError(401, 'Unauthorized')

  const body: unknown = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((i) => i.message).join('; '), 'VALIDATION_ERROR')
  }

  await deletePushSubscriptionByEndpoint(supabase, user.id, parsed.data.endpoint)
  return NextResponse.json({ ok: true })
})
