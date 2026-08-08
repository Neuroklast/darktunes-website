/**
 * POST — Admin approve/reject Fan Page
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { extractBearerToken, verifyAdminOrEditor } from '@/lib/adminAuth'
import { reviewFanPage } from '@/lib/api/fanPageDocument'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { revalidateTag } from 'next/cache'
import { emitNotification } from '@/lib/notifications/emit'

const bodySchema = z.object({
  approved: z.boolean(),
  comment: z.string().max(500).optional(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  const userId = await verifyAdminOrEditor(token)
  const artistId = req.nextUrl.pathname.split('/').at(-1)
  if (!artistId || artistId === 'review') throw new ApiError(400, 'Missing artist id')
  const body = bodySchema.parse(await req.json())

  const supabase = await createServerSupabaseClient()

  const { data: artist } = await supabase
    .from('artists')
    .select('slug, name')
    .eq('id', artistId)
    .maybeSingle()

  if (!artist) throw new ApiError(404, 'Artist not found')

  const result = await reviewFanPage(supabase, artistId, body.approved, userId, body.comment)

  if (result.publishStatus === 'published') {
    revalidateTag(`fan-page-${artist.slug}`, 'max')
  }

  // Notify artist members (service role — artists cannot self-insert)
  try {
    const serviceDb = await createServiceRoleSupabaseClient()
    const decision = body.approved ? 'approved' : 'rejected'
    await emitNotification(serviceDb, {
      type: 'fan_page_review_decision',
      entityId: artistId,
      entityName: body.approved
        ? `${artist.name}: Fan page approved`
        : `${artist.name}: Fan page needs changes`,
      senderId: userId,
      artistId,
      payload: {
        approved: body.approved,
        comment: body.comment ?? null,
        publishStatus: result.publishStatus,
      },
      // Allow multiple review rounds: include status so re-review can notify again
      dedupeKey: `fan_page_review_decision:${artistId}:${decision}:${result.publishStatus}`,
    })
  } catch (err) {
    console.error('[fan-page/review] notification emit failed:', err)
  }

  return NextResponse.json(result)
})