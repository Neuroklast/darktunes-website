/**
 * POST /api/push/subscribe
 * Persist a Web Push subscription for the authenticated user (artist or staff).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from '@/lib/supabase/server'
import { upsertPushSubscription } from '@/lib/push/subscriptions'
import { isWebPushConfigured } from '@/lib/push/vapid'

const bodySchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  if (!isWebPushConfigured()) {
    throw new ApiError(503, 'Web Push is not configured on this server', 'PUSH_NOT_CONFIGURED')
  }

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

  // Service role: reassign endpoint if the same browser logs in as another user
  // (unique on endpoint; user-JWT RLS would block UPDATE of another user's row).
  const serviceDb = await createServiceRoleSupabaseClient()
  const userAgent = req.headers.get('user-agent')
  await upsertPushSubscription(
    serviceDb,
    user.id,
    {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    userAgent,
  )

  return NextResponse.json({ ok: true })
})