import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractBearerToken, verifyAdminOrEditor } from '@/lib/adminAuth'
import { getReleaseSubmissionById } from '@/lib/api/releaseSubmissions'
import { getArtistById } from '@/lib/api/artists'
import {
  buildBelieveExportCsv,
  buildBelieveReleaseExport,
  validateBelieveExport,
} from '@/lib/releases/believeExport'

function extractSubmissionId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/')
  // .../release-submissions/{id}/export-believe
  return segments[segments.length - 2] ?? ''
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = extractBearerToken(req.headers.get('authorization'))
  await verifyAdminOrEditor(token)

  const id = extractSubmissionId(req)
  if (!id) throw new ApiError(400, 'Submission ID is required')

  const format = new URL(req.url).searchParams.get('format') ?? 'json'
  if (format !== 'json' && format !== 'csv') {
    throw new ApiError(400, 'format must be json or csv')
  }

  const supabase = await createServerSupabaseClient()
  const submission = await getReleaseSubmissionById(supabase, id)
  if (!submission) throw new ApiError(404, 'Submission not found')

  const artist = await getArtistById(supabase, submission.artistId)
  if (!artist) throw new ApiError(404, 'Artist not found')

  const validation = validateBelieveExport(submission, artist.name)
  if (!validation.valid) {
    throw new ApiError(422, validation.errors.join('; '), 'BELIEVE_EXPORT_INVALID')
  }

  const exportData = buildBelieveReleaseExport(submission, artist.name)
  const stamp = new Date().toISOString().slice(0, 10)
  const safeTitle = submission.title.replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 40)

  if (format === 'csv') {
    const csv = buildBelieveExportCsv(exportData)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="believe-export-${safeTitle}-${stamp}.csv"`,
        'X-Export-Warnings': validation.warnings.join(' | '),
      },
    })
  }

  return NextResponse.json({ data: exportData, warnings: validation.warnings })
})