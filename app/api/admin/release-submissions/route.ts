import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { getAllReleaseSubmissions } from '@/lib/api/releaseSubmissions'

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServerSupabaseClient()
  const submissions = await getAllReleaseSubmissions(supabase, organizationId)

  const artistIds = [...new Set(submissions.map((s) => s.artistId))]
  const artistNames = new Map<string, string>()
  if (artistIds.length > 0) {
    const { data: artists } = await supabase.from('artists').select('id, name').in('id', artistIds)
    for (const a of artists ?? []) {
      artistNames.set(a.id, a.name)
    }
  }

  const enriched = submissions.map((sub) => {
    const fromJoin = artistNames.get(sub.artistId)
    const fromForm =
      typeof sub.formData?.artist_name === 'string' ? sub.formData.artist_name : null
    return {
      ...sub,
      artistName: fromJoin || fromForm || null,
    }
  })

  return NextResponse.json(enriched)
})
