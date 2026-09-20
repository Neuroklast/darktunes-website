/**
 * app/api/admin/app-logs/[id]/route.ts
 *
 * PATCH /api/admin/app-logs/:id — resolve or ignore an aggregated error log
 * entry. Admin only. Writes are audited automatically (admin_audit_log).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import type { Database } from '@/types/database'

const patchSchema = z
  .object({
    resolved: z.boolean().optional(),
    ignored: z.boolean().optional(),
  })
  .refine((value) => value.resolved !== undefined || value.ignored !== undefined, {
    message: 'Provide resolved and/or ignored',
  })

export const PATCH = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId, serviceClient } = await requireAdminWithServiceClient(req)

  const id = req.nextUrl.pathname.split('/').filter(Boolean).pop() ?? ''
  if (!id) throw new ApiError(400, 'Missing id')

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(
      400,
      parsed.error.issues.map((issue) => issue.message).join('; '),
      'VALIDATION_ERROR',
    )
  }

  const update: Database['public']['Tables']['app_logs']['Update'] = {}
  if (parsed.data.resolved !== undefined) {
    update.resolved = parsed.data.resolved
    update.resolved_at = parsed.data.resolved ? new Date().toISOString() : null
    update.resolved_by = parsed.data.resolved ? userId : null
  }
  if (parsed.data.ignored !== undefined) {
    update.ignored = parsed.data.ignored
  }

  const { data, error } = await serviceClient
    .from('app_logs')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) throw new ApiError(500, `Failed to update log entry: ${error.message}`)
  if (!data) throw new ApiError(404, 'Log entry not found')

  return NextResponse.json({ data }, { status: 200 })
})
