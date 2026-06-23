import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyPermission } from '@/lib/adminAuth'
import { getBioEventAnalytics } from '@/lib/api/bioEvents'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyPermission(token, 'can_manage_artists')
  const supabase = await createServerSupabaseClient()
  const analytics = await getBioEventAnalytics(supabase)
  return NextResponse.json({ analytics })
})