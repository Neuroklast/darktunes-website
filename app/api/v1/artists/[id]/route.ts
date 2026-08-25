import { NextResponse } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { withPartnerAuth } from '@/lib/partner-api/withPartnerAuth'
import { requirePartnerScope } from '@/lib/partner-api/scopes'
import { getPartnerArtistById } from '@/lib/partner-api/queries'

function extractId(req: Request): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

export const GET = withPartnerAuth(async (req, auth) => {
  requirePartnerScope(auth, 'read')
  const db = await createServiceRoleSupabaseClient()
  const artist = await getPartnerArtistById(db, auth.organizationId, extractId(req))
  if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
  return NextResponse.json({ data: artist })
})