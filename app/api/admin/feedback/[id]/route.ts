/**
 * PATCH /api/admin/feedback/[id] — update feedback status
 *
 * Dual-auth + service-role write after admin/editor check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import {
  PORTAL_FEEDBACK_STATUSES,
  updatePortalFeedbackStatus,
} from '@/lib/api/portalFeedback'

const bodySchema = z.object({
  status: z.enum(PORTAL_FEEDBACK_STATUSES),
})

const idSchema = z.string().uuid()

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdminOrEditorFromRequest(req)

  const idParsed = idSchema.safeParse(extractId(req))
  if (!idParsed.success) throw new ApiError(400, 'Invalid feedback id')

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  }

  const supabase = await createServiceRoleSupabaseClient()
  try {
    const updated = await updatePortalFeedbackStatus(
      supabase,
      idParsed.data,
      parsed.data.status,
    )
    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    if (/not found|0 rows|PGRST116/i.test(message)) {
      throw new ApiError(404, 'Feedback not found')
    }
    throw err
  }
})
