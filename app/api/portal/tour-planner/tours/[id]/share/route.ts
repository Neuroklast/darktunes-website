/**
 * GET    — list active share links for a tour
 * POST   — create a public read-only share link
 * DELETE — revoke a share link (?linkId=)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import {
  authenticateTourPlannerRequest,
  assertTourOwner,
} from '@/lib/portal/tourPlannerAuth'
import {
  createTourShareLink,
  listTourShareLinks,
  revokeTourShareLink,
} from '@/lib/api/tourShareLinks'
import { getTourById } from '@/lib/api/tours'

function tourIdFromPath(pathname: string): string {
  // .../tours/{id}/share
  const parts = pathname.split('/').filter(Boolean)
  const toursIdx = parts.indexOf('tours')
  const id = toursIdx >= 0 ? parts[toursIdx + 1] : null
  if (!id || id === 'share') throw new ApiError(400, 'Missing tour id')
  return id
}

const createSchema = z.object({
  label: z.string().max(120).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const tourId = tourIdFromPath(req.nextUrl.pathname)
  const artistId = req.nextUrl.searchParams.get('artistId')
  const { supabase, artist } = await authenticateTourPlannerRequest(req, artistId)
  await assertTourOwner(supabase, tourId, artist.id)

  const tour = await getTourById(supabase, tourId)
  if (!tour) throw new ApiError(404, 'Tour not found')

  const links = await listTourShareLinks(supabase, tourId, artist.id)
  return NextResponse.json({
    links: links.map((l) => ({
      ...l,
      url: `/tour/share/${l.token}`,
    })),
  })
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const tourId = tourIdFromPath(req.nextUrl.pathname)
  const artistId = req.nextUrl.searchParams.get('artistId')
  const { supabase, artist, user } = await authenticateTourPlannerRequest(req, artistId)
  await assertTourOwner(supabase, tourId, artist.id)

  const tour = await getTourById(supabase, tourId)
  if (!tour) throw new ApiError(404, 'Tour not found')

  const body = createSchema.parse(await req.json().catch(() => ({})))
  const link = await createTourShareLink(supabase, {
    tourId,
    artistId: artist.id,
    createdBy: user.id,
    label: body.label,
    expiresAt: body.expiresAt ?? null,
  })

  return NextResponse.json(
    {
      link: {
        ...link,
        url: `/tour/share/${link.token}`,
      },
    },
    { status: 201 },
  )
})

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const tourId = tourIdFromPath(req.nextUrl.pathname)
  const artistId = req.nextUrl.searchParams.get('artistId')
  const linkId = req.nextUrl.searchParams.get('linkId')
  if (!linkId) throw new ApiError(400, 'linkId is required')

  const { supabase, artist } = await authenticateTourPlannerRequest(req, artistId)
  await assertTourOwner(supabase, tourId, artist.id)
  await revokeTourShareLink(supabase, artist.id, linkId)
  return NextResponse.json({ ok: true })
})
