import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
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
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const serviceRole = await createServiceRoleSupabaseClient()

  const id = extractId(req)
  const body = patchSchema.parse(await req.json())

  let submission
  try {
    submission = await updateVideoSubmissionStatus(
      serviceRole,
      id,
      body.status,
      body.adminReply,
      organizationId,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    if (message.toLowerCase().includes('no data') || message.includes('PGRST116')) {
      throw new ApiError(404, 'Video submission not found')
    }
    throw err
  }

  if (body.status === 'accepted' || body.status === 'rejected') {
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
