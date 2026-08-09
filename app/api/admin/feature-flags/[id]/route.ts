import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { updateFeatureFlag } from '@/lib/api/featureFlags'

const schema = z.object({
  enabled: z.boolean(),
})

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

export const PATCH = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) throw new ApiError(400, 'Invalid payload', 'VALIDATION_ERROR')

  const supabase = await createServiceRoleSupabaseClient()
  const flag = await updateFeatureFlag(
    supabase,
    extractId(req),
    parsed.data.enabled,
    organizationId,
  )
  return NextResponse.json({ flag })
})
