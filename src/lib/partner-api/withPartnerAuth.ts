import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { authenticatePartnerApiKey, type PartnerApiAuthContext } from '@/lib/partner-api/auth'
import { organizationHasFeature } from '@/lib/organizations/features'
import { ApiError } from '@/lib/errors'

type PartnerHandler = (
  req: NextRequest,
  ctx: PartnerApiAuthContext,
) => Promise<NextResponse>

export function withPartnerAuth(handler: PartnerHandler) {
  return withErrorHandler(async (req: NextRequest) => {
    const db = await createServiceRoleSupabaseClient()
    const auth = await authenticatePartnerApiKey(db, req.headers.get('authorization'))
    const partnerApiEnabled = await organizationHasFeature(db, auth.organizationId, 'partner_api')
    if (!partnerApiEnabled) {
      throw new ApiError(403, 'Partner API is not enabled for this organization', 'PARTNER_API_DISABLED')
    }
    return handler(req, auth)
  })
}
