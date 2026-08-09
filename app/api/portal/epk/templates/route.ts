/**
 * app/api/portal/epk/templates/route.ts
 *
 * GET — list published EPK starter templates (portal auth required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { listPublishedEpkTemplates } from '@/lib/api/epkTemplates'
import { mergeWithBuiltinTemplates } from '@/lib/epk/templates/starterTemplates'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { authenticatePortalBearer } from '@/lib/portal/bearerAuth'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { supabase } = await authenticatePortalBearer(req)
  const organizationId = await getRequestOrganizationId(supabase)
  const dbTemplates = await listPublishedEpkTemplates(supabase, organizationId)
  const templates = mergeWithBuiltinTemplates(dbTemplates)
  return NextResponse.json({ templates })
})