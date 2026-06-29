import { NextResponse } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { withPartnerAuth } from '@/lib/partner-api/withPartnerAuth'

export const GET = withPartnerAuth(async (_req, auth) => {
  const db = await createServiceRoleSupabaseClient()
  const { data, error } = await db
    .from('release_submissions')
    .select('id, artist_id, status, title, release_date, type, genre, isrc, catalog_number, created_at')
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)
  return NextResponse.json({ data: data ?? [] })
})