/**
 * GET /api/admin/ai/usage
 * Token usage split by input/output/reasoning, model, role, day, budget and failures.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { withErrorHandler } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { startOfUtcDay, startOfUtcMonth } from '@/lib/ai/budget/limits'
import { getAiSettings } from '@/lib/api/aiSettings'

export const dynamic = 'force-dynamic'

interface UsageRow {
  user_id: string
  model: string
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  total_tokens: number
  success: boolean
  error_code: string | null
  created_at: string
}

const MAX_EVENTS = 20_000

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { serviceClient } = await requireAdminWithServiceClient(req)
  const settings = await getAiSettings(serviceClient)
  const now = new Date()
  const dayStart = startOfUtcDay(now).toISOString()
  const monthStart = startOfUtcMonth(now).toISOString()

  const [{ data: rawEvents }, { data: dayBudgets }, { data: monthBudgets }] = await Promise.all([
    serviceClient
      .from('ai_usage_events')
      .select(
        'user_id, model, input_tokens, output_tokens, reasoning_tokens, total_tokens, success, error_code, created_at',
      )
      .gte('created_at', monthStart)
      .order('created_at', { ascending: true })
      .limit(MAX_EVENTS),
    serviceClient
      .from('ai_token_budgets')
      .select('scope, used_tokens, reserved_tokens, token_limit')
      .eq('period', 'day')
      .eq('period_start', dayStart),
    serviceClient
      .from('ai_token_budgets')
      .select('scope, used_tokens, reserved_tokens, token_limit')
      .eq('period', 'month')
      .eq('period_start', monthStart),
  ])

  const events = (rawEvents ?? []) as UsageRow[]
  const todayEvents = events.filter((row) => row.created_at >= dayStart)
  const roles = await loadRoles(
    serviceClient,
    [...new Set(events.map((row) => row.user_id))],
  )

  const today = summarize(todayEvents)
  const month = summarize(events)
  const byModel = new Map<
    string,
    { model: string; input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number; calls: number; failures: number }
  >()
  const byRole = new Map<string, { role: string; total_tokens: number; calls: number }>()
  const byDay = new Map<
    string,
    { date: string; input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number; failures: number }
  >()
  const failuresByCode = new Map<string, number>()

  for (const row of events) {
    const model = byModel.get(row.model) ?? {
      model: row.model,
      input_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 0,
      total_tokens: 0,
      calls: 0,
      failures: 0,
    }
    model.input_tokens += row.input_tokens
    model.output_tokens += row.output_tokens
    model.reasoning_tokens += row.reasoning_tokens
    model.total_tokens += row.total_tokens
    model.calls += 1
    if (!row.success) model.failures += 1
    byModel.set(row.model, model)

    const role = roles.get(row.user_id) ?? 'unknown'
    const roleRow = byRole.get(role) ?? { role, total_tokens: 0, calls: 0 }
    roleRow.total_tokens += row.total_tokens
    roleRow.calls += 1
    byRole.set(role, roleRow)

    const date = row.created_at.slice(0, 10)
    const day = byDay.get(date) ?? {
      date,
      input_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 0,
      total_tokens: 0,
      failures: 0,
    }
    day.input_tokens += row.input_tokens
    day.output_tokens += row.output_tokens
    day.reasoning_tokens += row.reasoning_tokens
    day.total_tokens += row.total_tokens
    if (!row.success) day.failures += 1
    byDay.set(date, day)

    if (!row.success) {
      const code = row.error_code ?? 'UNKNOWN'
      failuresByCode.set(code, (failuresByCode.get(code) ?? 0) + 1)
    }
  }

  const failureCount = events.filter((row) => !row.success).length
  return NextResponse.json({
    today_tokens: today.total_tokens,
    month_tokens: month.total_tokens,
    today,
    month,
    truncated: events.length >= MAX_EVENTS,
    by_model: [...byModel.values()].sort((a, b) => b.total_tokens - a.total_tokens),
    by_role: [...byRole.values()].sort((a, b) => b.total_tokens - a.total_tokens),
    by_day: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    budget: {
      global_day: budgetRow(dayBudgets ?? [], 'global', settings.tokenLimits.global.day),
      global_month: budgetRow(monthBudgets ?? [], 'global', settings.tokenLimits.global.month),
      user_day: budgetRow(dayBudgets ?? [], 'user', 0),
      user_month: budgetRow(monthBudgets ?? [], 'user', 0),
    },
    failures: {
      count: failureCount,
      by_code: [...failuresByCode.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count),
    },
  })
})

function summarize(rows: UsageRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.input_tokens += row.input_tokens
      acc.output_tokens += row.output_tokens
      acc.reasoning_tokens += row.reasoning_tokens
      acc.total_tokens += row.total_tokens
      acc.calls += 1
      if (!row.success) acc.failed += 1
      return acc
    },
    { input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, total_tokens: 0, calls: 0, failed: 0 },
  )
}

function budgetRow(
  rows: Array<{ scope: string; used_tokens: number; reserved_tokens: number; token_limit: number }>,
  scope: 'global' | 'user',
  fallbackLimit: number,
) {
  return rows
    .filter((row) => row.scope === scope)
    .reduce(
      (acc, row) => {
        acc.token_limit += row.token_limit
        acc.used_tokens += row.used_tokens
        acc.reserved_tokens += row.reserved_tokens
        return acc
      },
      { token_limit: fallbackLimit, used_tokens: 0, reserved_tokens: 0 },
    )
}

async function loadRoles(
  db: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(userIds.filter(Boolean))]
  for (let index = 0; index < unique.length; index += 500) {
    const chunk = unique.slice(index, index + 500)
    const { data } = await db.from('users').select('id, role').in('id', chunk)
    for (const row of data ?? []) out.set(row.id, row.role)
  }
  return out
}
