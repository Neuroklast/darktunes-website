import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminWithServiceClient } from '@/lib/adminAuth'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { getAiSettings } from '@/lib/api/aiSettings'

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
  const [{ data: config, error }, { data: accounts, error: accountsError }] = await Promise.all([
    serviceClient.from('ai_credit_settings').select('*').eq('id', true).single(),
    serviceClient.from('ai_credit_accounts').select('scope, scope_id, period_start, monthly_allowance, used_credits, reserved_credits').order('period_start', { ascending: false }).limit(200),
  ])
  if (error || accountsError || !config) throw new ApiError(503, 'AI credits schema has not been installed.', 'AI_CREDITS_UNAVAILABLE')
  return NextResponse.json({ settings: config, accounts: accounts ?? [] })
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const { serviceClient } = await requireAdminWithServiceClient(req)
  const parsed = patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) throw new ApiError(400, 'Invalid credit configuration.', 'VALIDATION_ERROR')
  const ai = await getAiSettings(serviceClient)
  if (parsed.data.enabled) {
    for (const model of [ai.modelFast, ai.modelReasoning, ...(ai.fallbackModel ? [ai.fallbackModel] : [])]) {
      if (!parsed.data.model_prices[model]) {
        throw new ApiError(400, `Missing pricing for configured model: ${model}`, 'VALIDATION_ERROR')
      }
    }
  }
  const { data, error } = await serviceClient.from('ai_credit_settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', true).select('*').single()
  if (error || !data) throw new ApiError(503, 'Could not save credit settings.', 'AI_CREDITS_UNAVAILABLE')
  return NextResponse.json({ settings: data })
})
