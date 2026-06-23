import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyPermission } from '@/lib/adminAuth'
import { listBioVersionsByArtistId } from '@/lib/api/bioVersions'

const querySchema = z.object({
  artistId: z.string().uuid(),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyPermission(token, 'can_manage_artists')

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({ artistId: searchParams.get('artistId') })
  if (!parsed.success) {
    throw new ApiError(400, 'artistId query parameter is required')
  }

  const supabase = await createServerSupabaseClient()
  const versions = await listBioVersionsByArtistId(supabase, parsed.data.artistId)
  return NextResponse.json({ versions })
})