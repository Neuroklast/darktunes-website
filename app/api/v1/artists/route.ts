import { NextResponse } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { withPartnerAuth } from '@/lib/partner-api/withPartnerAuth'

export const GET = withPartnerAuth(async (_req, auth) => {
  const db = await createServiceRoleSupabaseClient()
  const { data, error } = await db
    .from('artists')
    .select('id, name, slug, genres, country, is_visible, created_at')
    .eq('organization_id', auth.organizationId)
    .order('name', { ascending: true })
    .limit(200)

  if (error) throw new Error(error.message)
  return NextResponse.json({ data: data ?? [] })
})