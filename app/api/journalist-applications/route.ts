/**
 * app/api/journalist-applications/route.ts
 *
 * GET  — Admin: list all journalist applications (service-role client)
 * POST — Public: submit a journalist application (user's own record)
 */

import { withErrorHandler, ApiError } from '@/lib/errors'
import { getUserRoleWithClient } from '@/lib/getUserRole'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  getJournalistApplications,
  createJournalistApplication,
} from '@/lib/api/journalistApplications'
import { isPressApplicationsEnabled } from '@/lib/pressAccess'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/ipRateLimit'
import { emitNotification } from '@/lib/notifications/emit'

const ApplySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  outlet: z.string().min(1),
  message: z.string().optional(),
})

export const GET = withErrorHandler(async () => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new ApiError(401, 'Unauthorized')

  const role = await getUserRoleWithClient(supabase, user.id)
  if (role !== 'admin') throw new ApiError(403, 'Forbidden')

  const db = await createServiceRoleSupabaseClient()
  const applications = await getJournalistApplications(db)
  return NextResponse.json({ applications })
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  // 3 applications per 30 minutes per IP
  if (checkRateLimit(getClientIp(req), 3, 30 * 60_000).limited) {
    throw new ApiError(429, 'Too many requests. Please try again later.', 'RATE_LIMITED')
  }

  const body = await req.json()
  const { email, name, outlet, message } = ApplySchema.parse(body)

  const db = await createServiceRoleSupabaseClient()
  const applicationsEnabled = await isPressApplicationsEnabled(db)
  if (!applicationsEnabled) {
    throw new ApiError(403, 'Press applications are currently disabled', 'FEATURE_DISABLED')
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const application = await createJournalistApplication(db, {
    email,
    name,
    outlet,
    message: message ?? null,
    user_id: user?.id ?? null,
  })

  try {
    await emitNotification(db, {
      type: 'journalist_application_submitted',
      entityId: application.id,
      entityName: `${name} — ${outlet}`,
      senderId: user?.id ?? null,
      dedupeKey: `journalist_application_submitted:${application.id}`,
    })
  } catch (err) {
    console.error('[journalist-applications] staff notify failed:', err)
  }

  return NextResponse.json({ application }, { status: 201 })
})
