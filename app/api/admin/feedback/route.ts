/**
 * GET /api/admin/feedback — list artist product feedback for admin/editor
 *
 * Dual-auth (Bearer or cookie) + service-role read so invisible artists still
 * resolve names and RLS never hides inbox rows after role check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import {
  listPortalFeedbackAdmin,
  PORTAL_FEEDBACK_CATEGORIES,
  PORTAL_FEEDBACK_STATUSES,
} from '@/lib/api/portalFeedback'

const querySchema = z.object({
  status: z.enum(PORTAL_FEEDBACK_STATUSES).optional(),
  category: z.enum(PORTAL_FEEDBACK_CATEGORIES).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdminOrEditorFromRequest(req)

  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    status: sp.get('status') ?? undefined,
    category: sp.get('category') ?? undefined,
    q: sp.get('q') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    offset: sp.get('offset') ?? undefined,
  })
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid query')
  }

  const supabase = await createServiceRoleSupabaseClient()
  const result = await listPortalFeedbackAdmin(supabase, {
    status: parsed.data.status,
    category: parsed.data.category,
    search: parsed.data.q,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  })

  return NextResponse.json(result)
})
