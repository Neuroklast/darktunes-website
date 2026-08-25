import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { authenticatePortalBearer } from '@/lib/portal/bearerAuth'
import { getPublishedPortalFaq } from '@/lib/api/portalFaq'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { supabase } = await authenticatePortalBearer(req)
  const organizationId = await getRequestOrganizationId(supabase)
  const tree = await getPublishedPortalFaq(supabase, organizationId)
  return NextResponse.json({ tree })
})
