import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { authenticatePartnerApiKey, type PartnerApiAuthContext } from '@/lib/partner-api/auth'

type PartnerHandler = (
  req: NextRequest,
  ctx: PartnerApiAuthContext,
) => Promise<NextResponse>

export function withPartnerAuth(handler: PartnerHandler) {
  return withErrorHandler(async (req: NextRequest) => {
    const db = await createServiceRoleSupabaseClient()
    const auth = await authenticatePartnerApiKey(db, req.headers.get('authorization'))
    return handler(req, auth)
  })
}