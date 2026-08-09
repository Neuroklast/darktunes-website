/**
 * GET  /api/admin/sos/workspaces?periodStart=...&periodEnd=... — load workspace for period
 * POST /api/admin/sos/workspaces — upsert workspace (rules config + bronze batches) for a period
 *
 * Sales Statement accounting workspace — shared config for a settlement period (host org).
 */

import { requireAdminFromRequest } from '@/lib/adminAuth'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import {
  deleteWorkspaceForPeriod,
  getWorkspaceForPeriod,
  upsertWorkspaceForPeriod,
  type AccountingWorkspaceConfig,
} from '@/lib/api/sosAccountingWorkspaces'
import { assertSettlementPeriodWritable } from '@/lib/api/settlementPeriods'
import { ApiError, withErrorHandler } from '@/lib/errors'

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)

  const periodStart = req.nextUrl.searchParams.get('periodStart')
  const periodEnd = req.nextUrl.searchParams.get('periodEnd')

  if (!periodStart || !periodEnd) {
    throw new ApiError(400, 'periodStart and periodEnd are required')
  }

  const serviceSupabase = await createServiceRoleSupabaseClient()
  const workspace = await getWorkspaceForPeriod(
    serviceSupabase,
    periodStart,
    periodEnd,
    organizationId,
  )

  return NextResponse.json({ workspace })
})

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { userId, organizationId } = await requireAdminFromRequest(req)
  const body = await req.json()

  const {
    period_start,
    period_end,
    config,
    bronze_batch_ids,
  } = body as {
    period_start?: string
    period_end?: string
    config?: AccountingWorkspaceConfig
    bronze_batch_ids?: string[]
  }

  if (!period_start || !period_end) {
    throw new ApiError(400, 'period_start and period_end are required')
  }
  if (!config || typeof config !== 'object') {
    throw new ApiError(400, 'config (rules bundle) is required')
  }

  const serviceSupabase = await createServiceRoleSupabaseClient()

  // Respect period locking when present
  await assertSettlementPeriodWritable(serviceSupabase, period_start, period_end)

  const workspace = await upsertWorkspaceForPeriod(serviceSupabase, {
    periodStart: period_start,
    periodEnd: period_end,
    config,
    bronzeBatchIds: bronze_batch_ids ?? [],
    updatedBy: userId,
    organizationId,
  })

  return NextResponse.json({ workspace }, { status: 200 })
})

export const DELETE = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { organizationId } = await requireAdminFromRequest(req)

  const periodStart = req.nextUrl.searchParams.get('periodStart')
  const periodEnd = req.nextUrl.searchParams.get('periodEnd')

  if (!periodStart || !periodEnd) {
    throw new ApiError(400, 'periodStart and periodEnd are required')
  }

  const serviceSupabase = await createServiceRoleSupabaseClient()
  await assertSettlementPeriodWritable(serviceSupabase, periodStart, periodEnd)

  const deleted = await deleteWorkspaceForPeriod(
    serviceSupabase,
    periodStart,
    periodEnd,
    organizationId,
  )

  return NextResponse.json({ deleted })
})
