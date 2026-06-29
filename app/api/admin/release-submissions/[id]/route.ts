import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandler } from '@/lib/errors'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdminOrEditor } from '@/lib/adminAuth'
import { updateReleaseSubmissionStatus } from '@/lib/api/releaseSubmissions'
import { getTracksBySubmissionId } from '@/lib/api/releaseSubmissionTracks'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { enqueueOrganizationWebhook } from '@/lib/partner-api/webhooks'

function extractId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  return segments[segments.length - 1]
}

const patchSchema = z.object({
  status: z.enum(['received', 'reviewed', 'accepted', 'rejected']),
  adminReply: z.string().optional(),
})

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdminOrEditor(token)
  const supabase = await createServiceRoleSupabaseClient()
  const id = extractId(req)
  const tracks = await getTracksBySubmissionId(supabase, id)
  return NextResponse.json({ tracks })
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdminOrEditor(token)
  const supabase = await createServerSupabaseClient()

  const id = extractId(req)
  const body = patchSchema.parse(await req.json())

  const submission = await updateReleaseSubmissionStatus(
    supabase,
    id,
    body.status,
    body.adminReply,
  )

  // Send label message to artist when status is accepted or rejected
  if ((body.status === 'accepted' || body.status === 'rejected') && body.adminReply) {
    const serviceRole = await createServiceRoleSupabaseClient()
    const subjectKey = body.status === 'accepted' ? 'accepted' : 'rejected'
    const subjectMap: Record<string, string> = {
      accepted: `Your release "${submission.title}" has been accepted`,
      rejected: `Your release "${submission.title}" has been rejected`,
    }
    await serviceRole.from('label_messages').insert({
      artist_id: submission.artistId,
      subject: subjectMap[subjectKey],
      body: body.adminReply,
      body_html: `<p>${body.adminReply.replace(/\n/g, '<br>')}</p>`,
    })
  }

  if (body.status === 'accepted') {
    void enqueueOrganizationWebhook(DEFAULT_ORGANIZATION_ID, 'release.approved', {
      submissionId: submission.id,
      artistId: submission.artistId,
      title: submission.title,
    })
  } else if (body.status === 'rejected') {
    void enqueueOrganizationWebhook(DEFAULT_ORGANIZATION_ID, 'release.rejected', {
      submissionId: submission.id,
      artistId: submission.artistId,
      title: submission.title,
    })
  }

  return NextResponse.json(submission)
})

