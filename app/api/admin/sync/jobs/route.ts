/**
 * GET  /api/admin/sync/jobs — list recent queue jobs (Advanced console)
 * POST /api/admin/sync/jobs — cancel or retry one/many jobs
 *
 * Admin only. No Vercel Cron dependency.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { withErrorHandler, ApiError } from '@/lib/errors'
import {
  cancelSyncJob,
  listSyncJobs,
  retrySyncJob,
  type SyncJobStatus,
  type SyncJobType,
} from '@/lib/api/syncQueue'
import { describeJobError } from '@/lib/sync/userFacingErrors'

const STATUSES: SyncJobStatus[] = ['pending', 'running', 'done', 'failed', 'cancelled']
const JOB_TYPES: SyncJobType[] = [
  'full',
  'spotify',
  'discogs',
  'youtube',
  'odesli',
  'songkick',
  'bandsintown',
]

function isStatus(value: string): value is SyncJobStatus {
  return (STATUSES as string[]).includes(value)
}

function isJobType(value: string): value is SyncJobType {
  return (JOB_TYPES as string[]).includes(value)
}

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { serviceClient: db } = await requireAdminWithServiceClient(req)

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const jobTypeParam = url.searchParams.get('jobType')
  const limitParam = url.searchParams.get('limit')

  let status: SyncJobStatus | SyncJobStatus[] | undefined
  if (statusParam === 'active') {
    status = ['pending', 'running']
  } else if (statusParam && statusParam.includes(',')) {
    status = statusParam.split(',').filter(isStatus)
  } else if (statusParam && isStatus(statusParam)) {
    status = statusParam
  }

  const jobType = jobTypeParam && isJobType(jobTypeParam) ? jobTypeParam : undefined
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50

  let jobs
  try {
    jobs = await listSyncJobs(db, {
      status,
      jobType,
      limit: Number.isFinite(limit) ? limit : 50,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Surface schema/query failures to admins (withErrorHandler hides plain Error).
    throw new ApiError(500, message, 'SERVER_ERROR')
  }

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      ...j,
      errorFriendly: describeJobError(j.errorMessage),
    })),
  })
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { serviceClient: db } = await requireAdminWithServiceClient(req)

  const body = (await req.json()) as {
    action?: string
    ids?: unknown
  }

  const action = body.action
  if (action !== 'cancel' && action !== 'retry') {
    throw new ApiError(400, 'action must be "cancel" or "retry"')
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    throw new ApiError(400, 'ids must be a non-empty array of job ids')
  }

  const ids = body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (ids.length === 0) throw new ApiError(400, 'ids must be a non-empty array of job ids')
  if (ids.length > 50) throw new ApiError(400, 'At most 50 job ids per request')

  const results: Array<{ id: string; ok: boolean; result: string }> = []

  for (const id of ids) {
    try {
      if (action === 'cancel') {
        const result = await cancelSyncJob(db, id)
        results.push({ id, ok: result !== 'noop', result })
      } else {
        const ok = await retrySyncJob(db, id)
        results.push({ id, ok, result: ok ? 'retried' : 'noop' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ id, ok: false, result: message })
    }
  }

  const changed = results.filter((r) => r.ok).length
  return NextResponse.json({ action, changed, results })
})
