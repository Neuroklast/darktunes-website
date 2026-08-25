import { NextResponse } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { withPartnerAuth } from '@/lib/partner-api/withPartnerAuth'
import { requirePartnerScope } from '@/lib/partner-api/scopes'
import { parsePartnerListParams } from '@/lib/partner-api/listParams'
import { listPartnerArtists } from '@/lib/partner-api/queries'

export const GET = withPartnerAuth(async (req, auth) => {
  requirePartnerScope(auth, 'read')
  const db = await createServiceRoleSupabaseClient()
  const result = await listPartnerArtists(db, auth.organizationId, parsePartnerListParams(req.url))
  return NextResponse.json(result)
})
