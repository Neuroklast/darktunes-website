/**
 * POST /api/admin/sos/persist-analytics
 *
 * Gold-layer persist for Settlement Center "Save to Portal" and draft upload
 * follow-up. Regular route (not a server action) so large metric payloads
 * do not trip Next.js Server Action / startTransition error boundaries.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { ApiError, withErrorHandler } from '@/lib/errors'
import {
  persistSosAnalyticsCore,
  type PersistSosAnalyticsInput,
} from '@/lib/sos/persistSosAnalyticsCore'

export const maxDuration = 60

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireAdminFromRequest(req)
  const body = (await req.json()) as PersistSosAnalyticsInput
  if (!body.periodStart || !body.periodEnd) {
    throw new ApiError(400, 'Missing periodStart or periodEnd')
  }
  if (!Array.isArray(body.territoryMetrics)) {
    throw new ApiError(400, 'territoryMetrics must be an array')
  }

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const result = await persistSosAnalyticsCore(serviceSupabase, body)
  return NextResponse.json(result, { status: result.success ? 200 : 422 })
})
