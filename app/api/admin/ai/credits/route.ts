import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { getAiSettings } from '@/lib/api/aiSettings'
import type { Json } from '@/types/database'

export const dynamic = 'force-dynamic'
const price = z.object({
  input_per_million_eur: z.number().finite().nonnegative(),
  output_per_million_eur: z.number().finite().nonnegative(),
  reasoning_per_million_eur: z.number().finite().nonnegative().optional(),
}).strict()
const patch = z.object({
  enabled: z.boolean(),
  buffer_percent: z.number().int().min(0).max(100),
  artist_monthly: z.number().int().nonnegative(),
  editor_monthly: z.number().int().nonnegative(),
  admin_monthly: z.number().int().nonnegative(),
  model_prices: z.record(z.string(), price),
}).strict()

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { serviceClient } = await requireAdminWithServiceClient(req)
  const [{ data: config, error }, { data: accounts, error: accountsError }, { data: summary, error: summaryError }, { data: recent, error: recentError }] = await Promise.all([
    serviceClient.from('ai_credit_settings').select('*').eq('id', true).single(),
    serviceClient.from('ai_credit_accounts').select('scope, scope_id, period_start, monthly_allowance, used_credits, reserved_credits').order('period_start', { ascending: false }).limit(200),
    serviceClient.rpc('ai_credit_cost_summary'),
    serviceClient.from('ai_credit_reservations')
      .select('request_id, model, scope, scope_id, reserved_credits, charged_credits, original_charged_credits, refunded_at, provider_cost_eur, price_snapshot, created_at, settled_at')
      .order('created_at', { ascending: false }).limit(30),
  ])
  if (error || accountsError || summaryError || recentError || !config) throw new ApiError(503, 'AI credits schema has not been installed.', 'AI_CREDITS_UNAVAILABLE')
  return NextResponse.json({ settings: config, accounts: accounts ?? [], summary, recent: recent ?? [] })
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { serviceClient } = await requireAdminWithServiceClient(req)
  const parsed = patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, 'Invalid credit configuration.', 'VALIDATION_ERROR')
  const ai = await getAiSettings(serviceClient)
  if (parsed.data.enabled) {
    for (const model of [ai.modelFast, ai.modelReasoning, ...(ai.fallbackModel ? [ai.fallbackModel] : [])]) {
      if (!parsed.data.model_prices[model] ||
          parsed.data.model_prices[model].input_per_million_eur + parsed.data.model_prices[model].output_per_million_eur <= 0) {
        throw new ApiError(400, `Missing pricing for configured model: ${model}`, 'VALIDATION_ERROR')
      }
    }
  }
  const { data, error } = await serviceClient.rpc('update_ai_credit_settings', {
    p_enabled: parsed.data.enabled,
    p_buffer_percent: parsed.data.buffer_percent,
    p_artist_monthly: parsed.data.artist_monthly,
    p_editor_monthly: parsed.data.editor_monthly,
    p_admin_monthly: parsed.data.admin_monthly,
    p_model_prices: parsed.data.model_prices as unknown as Json,
  })
  if (error || !data) throw new ApiError(503, 'Could not save credit settings.', 'AI_CREDITS_UNAVAILABLE')
  return NextResponse.json({ settings: data })
})
