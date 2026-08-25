import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { requireAdminOrEditorFromRequest } from '@/lib/adminAuth'
import { getAllReleaseSubmissions } from '@/lib/api/releaseSubmissions'
import { getTracksBySubmissionIds } from '@/lib/api/releaseSubmissionTracks'
import { getAllFormSchemaFields } from '@/lib/api/submissionFormSchema'
import {
  buildSubmissionExportRows,
  buildSubmissionsCsv,
  buildSubmissionsExcel,
  collectAvailableExportKeys,
  resolveExportColumns,
} from '@/lib/submissions/submissionExport'
import { getReleaseSubmissionExportColumns } from '@/lib/submissions/exportColumnSettings'

function slugifyFilenamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'submission'
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { organizationId } = await requireAdminOrEditorFromRequest(req)
  const supabase = await createServiceRoleSupabaseClient()

  const format = req.nextUrl.searchParams.get('format') ?? 'csv'
  if (format !== 'csv' && format !== 'xlsx') {
    throw new ApiError(400, 'format must be csv or xlsx')
  }

  const statusFilter = req.nextUrl.searchParams.get('status')
  const singleId = req.nextUrl.searchParams.get('id')
  const idsParam = req.nextUrl.searchParams.get('ids')
  const idSet = new Set<string>()
  if (singleId) idSet.add(singleId)
  if (idsParam) {
    for (const part of idsParam.split(',')) {
      const trimmed = part.trim()
      if (trimmed) idSet.add(trimmed)
    }
  }

  let submissions = await getAllReleaseSubmissions(supabase, organizationId)
  if (statusFilter) {
    submissions = submissions.filter((s) => s.status === statusFilter)
  }
  if (idSet.size > 0) {
    submissions = submissions.filter((s) => idSet.has(s.id))
  }

  const submissionIds = submissions.map((s) => s.id)
  const tracks = await getTracksBySubmissionIds(supabase, submissionIds)
  const tracksBySubmission = new Map<string, typeof tracks>()
  for (const track of tracks) {
    const list = tracksBySubmission.get(track.submissionId) ?? []
    list.push(track)
    tracksBySubmission.set(track.submissionId, list)
  }

  const artistIds = [...new Set(submissions.map((s) => s.artistId))]
  const artistNames = new Map<string, string>()
  if (artistIds.length > 0) {
    const { data: artists } = await supabase.from('artists').select('id, name').in('id', artistIds)
    for (const a of artists ?? []) {
      artistNames.set(a.id, a.name)
    }
  }

  const schemaFields = await getAllFormSchemaFields(supabase, 'release')
  const rows = buildSubmissionExportRows({
    submissions,
    tracksBySubmission,
    artistNames,
    schemaFields,
  })

  const available = collectAvailableExportKeys(rows, schemaFields)
  const columnsQuery = req.nextUrl.searchParams.get('columns')
  let columnOrder: string[]
  if (columnsQuery) {
    const fromQuery = columnsQuery.split(',').map((c) => c.trim()).filter(Boolean)
    columnOrder = resolveExportColumns(fromQuery, available)
  } else {
    const saved = await getReleaseSubmissionExportColumns(supabase)
    columnOrder = resolveExportColumns(saved, available)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  let filenameBase = `release-submissions-${stamp}`
  if (submissions.length === 1) {
    filenameBase = `release-submission-${slugifyFilenamePart(submissions[0].title)}-${stamp}`
  }

  if (format === 'xlsx') {
    const buffer = await buildSubmissionsExcel(rows, columnOrder)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
      },
    })
  }

  const csv = buildSubmissionsCsv(rows, columnOrder)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
    },
  })
})
