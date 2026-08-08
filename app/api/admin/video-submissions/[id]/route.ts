import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdminOrEditor } from '@/lib/adminAuth'
import { updateVideoSubmissionStatus } from '@/lib/api/videoSubmissions'
import { emitNotification } from '@/lib/notifications/emit'

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

const patchSchema = z.object({
  status: z.enum(['received', 'reviewed', 'accepted', 'rejected']),
  adminReply: z.string().optional(),
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdminOrEditor(token)
  const supabase = await createServerSupabaseClient()

  const id = extractId(req)
  const body = patchSchema.parse(await req.json())

  const submission = await updateVideoSubmissionStatus(
    supabase,
    id,
    body.status,
    body.adminReply,
  )

  if (body.status === 'accepted' || body.status === 'rejected') {
    const serviceRole = await createServiceRoleSupabaseClient()
    const decisionLabel = body.status === 'accepted' ? 'accepted' : 'rejected'
    const subjectMap: Record<string, string> = {
      accepted: `Your video "${submission.title}" has been accepted`,
      rejected: `Your video "${submission.title}" has been rejected`,
    }

    if (body.adminReply) {
      await serviceRole.from('label_messages').insert({
        artist_id: submission.artistId,
        subject: subjectMap[decisionLabel],
        body: body.adminReply,
        body_html: `<p>${body.adminReply.replace(/\n/g, '<br>')}</p>`,
      })
    }

    await emitNotification(serviceRole, {
      type: 'video_submission_decision',
      entityId: submission.id,
      entityName: subjectMap[decisionLabel],
      artistId: submission.artistId,
      payload: { status: body.status },
      dedupeKey: `video_submission_decision:${submission.id}:${body.status}`,
    })
  }

  return NextResponse.json(submission)
})
