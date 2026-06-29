import { NextResponse } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { withPartnerAuth } from '@/lib/partner-api/withPartnerAuth'

export const GET = withPartnerAuth(async (_req, auth) => {
  const db = await createServiceRoleSupabaseClient()
  const { data, error } = await db
    .from('releases')
    .select('id, title, artist_id, release_date, type, catalog_number, isrc, featured')
    .eq('organization_id', auth.organizationId)
    .order('release_date', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)
  return NextResponse.json({ data: data ?? [] })
})