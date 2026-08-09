import { NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdmin } from '@/lib/adminAuth'
import { listOrganizations } from '@/lib/api/organizations'

export const GET = withErrorHandler(async (req) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdmin(token)
  const supabase = await createServerSupabaseClient()
  const organizations = await listOrganizations(supabase)
  return NextResponse.json(organizations)
})
