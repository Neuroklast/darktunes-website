/**
 * GET /api/admin/ai/usage — server-side aggregation, no event count cap.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ApiError, withErrorHandler } from '@/lib/errors'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { startOfUtcDay, startOfUtcMonth } from '@/lib/ai/budget/limits'
import { getAiSettings } from '@/lib/api/aiSettings'

export const dynamic = 'force-dynamic'

interface UsageTotal {
  input_tokens: number; output_tokens: number; reasoning_tokens: number
  total_tokens: number; calls: number; failed: number
}
interface UsageSummary {
  today: UsageTotal; month: UsageTotal
  by_model: Array<{ model: string; input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number; calls: number; failures: number }>
  by_role: Array<{ role: string; total_tokens: number; calls: number }>
  by_day: Array<{ date: string; input_tokens: number; output_tokens: number; reasoning_tokens: number; total_tokens: number; failures: number }>
  failures: { count: number; by_code: Array<{ code: string; count: number }> }
}

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { serviceClient } = await requireAdminWithServiceClient(req)
  const settings = await getAiSettings(serviceClient)
  const dayStart = startOfUtcDay().toISOString()
  const monthStart = startOfUtcMonth().toISOString()

  const [{ data: rawSummary, error: summaryError }, { data: dayBudgets }, { data: monthBudgets }] = await Promise.all([
    serviceClient.rpc('ai_usage_month_summary'),
    serviceClient.from('ai_token_budgets')
      .select('scope, used_tokens, reserved_tokens, token_limit')
      .eq('period', 'day').eq('period_start', dayStart),
    serviceClient.from('ai_token_budgets')
      .select('scope, used_tokens, reserved_tokens, token_limit')
      .eq('period', 'month').eq('period_start', monthStart),
  ])
  if (summaryError || !rawSummary) {
    throw new ApiError(503, 'AI usage summary unavailable. Apply the latest database schema.', 'DB_ERROR')
  }
  const summary = rawSummary as unknown as UsageSummary
  return NextResponse.json({
    today_tokens: summary.today.total_tokens,
    month_tokens: summary.month.total_tokens,
    today: summary.today,
    month: summary.month,
    by_model: summary.by_model,
    by_role: summary.by_role,
    by_day: summary.by_day,
    truncated: false,
    budget: {
      global_day: budgetRow(dayBudgets ?? [], 'global', settings.tokenLimits.global.day),
      global_month: budgetRow(monthBudgets ?? [], 'global', settings.tokenLimits.global.month),
      user_day: budgetRow(dayBudgets ?? [], 'user', 0),
      user_month: budgetRow(monthBudgets ?? [], 'user', 0),
    },
    failures: summary.failures,
  })
})

function budgetRow(
  rows: Array<{ scope: string; used_tokens: number; reserved_tokens: number; token_limit: number }>,
  scope: 'global' | 'user',
  fallbackLimit: number,
) {
  const filtered = rows.filter((row) => row.scope === scope)
  if (filtered.length === 0) {
    return { token_limit: fallbackLimit, used_tokens: 0, reserved_tokens: 0 }
  }
  return filtered.reduce((acc, row) => {
    acc.token_limit += row.token_limit
    acc.used_tokens += row.used_tokens
    acc.reserved_tokens += row.reserved_tokens
    return acc
  }, { token_limit: 0, used_tokens: 0, reserved_tokens: 0 })
}
