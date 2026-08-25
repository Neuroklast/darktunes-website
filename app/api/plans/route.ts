import { NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listActivePlans } from '@/lib/api/plans'

export const GET = withErrorHandler(async () => {
  const supabase = await createServerSupabaseClient()
  const plans = await listActivePlans(supabase)
  return NextResponse.json(plans)
})
