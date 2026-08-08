/**
 * app/api/journalist-applications/[id]/route.ts
 *
 * PATCH — Admin: approve or reject a journalist application.
 *         The applicant's profile role is automatically updated by the
 *         `trg_journalist_application_status_change` database trigger:
 *         'approved' → role becomes 'journalist'; 'rejected' → role reverts to 'user'.
 */

import { withErrorHandler, ApiError } from '@/lib/errors'
import { getUserRoleWithClient } from '@/lib/getUserRole'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { updateApplicationStatus } from '@/lib/api/journalistApplications'
import { emitNotification } from '@/lib/notifications/emit'
import { z } from 'zod'

const UpdateSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new ApiError(401, 'Unauthorized')

  const role = await getUserRoleWithClient(supabase, user.id)
  if (role !== 'admin') throw new ApiError(403, 'Forbidden')

  const body = await req.json()
  const { status } = UpdateSchema.parse(body)

  // Extract the [id] segment from the URL path
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const id = segments[segments.length - 1]

  const db = await createServiceRoleSupabaseClient()
  const application = await updateApplicationStatus(db, id, status, user.id)

  // Role promotion/demotion is handled atomically by the database trigger
  // `trg_journalist_application_status_change`. No manual update is needed here.

  if (application.userId) {
    try {
      await emitNotification(db, {
        type: 'journalist_application_decision',
        entityId: application.id,
        entityName:
          status === 'approved'
            ? 'Your press application was approved'
            : 'Your press application was rejected',
        senderId: user.id,
        userIds: [application.userId],
        payload: { status },
        dedupeKey: `journalist_application_decision:${application.id}:${status}`,
      })
    } catch (err) {
      console.error('[journalist-applications] applicant notify failed:', err)
    }
  }

  return NextResponse.json({ application })
})
