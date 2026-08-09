import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { listOrganizationAuditLogs } from '@/lib/api/organizationAuditLog'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdmin(token)
  const orgId = new URL(req.url).searchParams.get('organizationId')
  if (!orgId) return NextResponse.json({ error: 'organizationId required' }, { status: 400 })

  const limit = Math.min(100, parseInt(new URL(req.url).searchParams.get('limit') ?? '50', 10) || 50)
  const supabase = await createServerSupabaseClient()
  const entries = await listOrganizationAuditLogs(supabase, orgId, limit)
  return NextResponse.json(entries)
})
