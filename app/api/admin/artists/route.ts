/**
 * app/api/admin/artists/route.ts
 *
 * GET /api/admin/artists
 * Returns all artists (id, name, slug) for admin UI dropdowns.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/adminAuth'
import { withErrorHandler } from '@/lib/errors'
import { getArtists } from '@/lib/api/artists'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()
  const artists = await getArtists(supabase, organizationId)
  return NextResponse.json({ artists })
})
