/**
 * app/api/admin/sos/period-summaries/route.ts
 *
 * GET  /api/admin/sos/period-summaries  — list Sales Statement period summaries (host org)
 * POST /api/admin/sos/period-summaries  — upsert a period summary (same path as Save to Portal)
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  listSosPeriodSummaries,
  upsertSosPeriodSummary,
  type SosPeriodSummary,
} from '@/lib/api/sosPeriodSummaries'
import { assertSettlementPeriodWritable } from '@/lib/api/settlementPeriods'
import { ApiError, withErrorHandler } from '@/lib/errors'

function summaryToApiRow(summary: SosPeriodSummary) {
  return {
    id: summary.id,
    period_start: summary.periodStart,
    period_end: summary.periodEnd,
    total_revenue: summary.totalRevenue,
    total_payout: summary.totalPayout,
    artist_count: summary.artistCount,
    artist_breakdowns: summary.artistBreakdowns,
    platform_breakdowns: summary.platformBreakdowns,
    source_batch_ids: summary.sourceBatchIds,
    created_at: summary.createdAt,
  }
}

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const serviceSupabase = await createServiceRoleSupabaseClient()
  const summaries = await listSosPeriodSummaries(serviceSupabase, organizationId)
  return NextResponse.json({ summaries: summaries.map(summaryToApiRow) })
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)
  const body = await req.json()
  const {
    period_start,
    period_end,
    total_revenue,
    total_payout,
    artist_count,
    artist_breakdowns,
    platform_breakdowns,
    source_batch_ids,
  } = body as {
    period_start?: string
    period_end?: string
    total_revenue?: number
    total_payout?: number
    artist_count?: number
    artist_breakdowns?: unknown[]
    platform_breakdowns?: unknown[]
    source_batch_ids?: string[]
  }

  if (!period_start || !period_end) {
    throw new ApiError(400, 'period_start and period_end are required')
  }

  const serviceSupabase = await createServiceRoleSupabaseClient()
  await assertSettlementPeriodWritable(serviceSupabase, period_start, period_end)

  const existing = (await listSosPeriodSummaries(serviceSupabase, organizationId)).find(
    (s) => s.periodStart === period_start && s.periodEnd === period_end,
  )

  const mergedBatchIds = [
    ...new Set([...(existing?.sourceBatchIds ?? []), ...(source_batch_ids ?? [])]),
  ]

  const summary = await upsertSosPeriodSummary(serviceSupabase, {
    periodStart: period_start,
    periodEnd: period_end,
    totalRevenue: total_revenue ?? 0,
    totalPayout: total_payout ?? 0,
    artistCount: artist_count ?? 0,
    artistBreakdowns: artist_breakdowns ?? [],
    platformBreakdowns: platform_breakdowns ?? [],
    sourceBatchIds: mergedBatchIds,
    organizationId,
  })

  return NextResponse.json(
    {
      summary: summaryToApiRow(summary),
      updated: Boolean(existing),
    },
    { status: existing ? 200 : 201 },
  )
})
