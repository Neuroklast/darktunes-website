import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyPermission } from '@/lib/adminAuth'
import { approveBioSubmission, rejectBioSubmission } from '@/lib/api/bioSubmissions'
import { getArtistById } from '@/lib/api/artists'

const bodySchema = z.object({
  action: z.enum(['approve', 'reject']),
  embargoUntil: z.string().datetime().nullable().optional(),
})

function extractArtistId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const reviewerId = await verifyPermission(token, 'can_manage_artists')

  const artistId = extractArtistId(req)
  const body: unknown = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues.map((e) => e.message).join('; '))
  }

  const supabase = await createServerSupabaseClient()
  const artist = await getArtistById(supabase, artistId).catch(() => null)
  if (!artist) throw new ApiError(404, 'Artist not found')

  if (parsed.data.action === 'approve') {
    const profile = await approveBioSubmission(supabase, {
      artistId,
      reviewerId,
      embargoUntil: parsed.data.embargoUntil ?? null,
    })

    revalidateTag('artists')
    revalidateTag('artist-profiles')
    if (artist.slug) {
      revalidateTag(`artist-${artist.slug}`)
      revalidatePath(`/artists/${artist.slug}`)
      revalidatePath(`/press/artists/${artist.slug}`)
    }
    revalidatePath('/press')

    return NextResponse.json({ profile })
  }

  const profile = await rejectBioSubmission(supabase, artistId, reviewerId)
  return NextResponse.json({ profile })
})