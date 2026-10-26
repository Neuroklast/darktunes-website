/**
 * GET /api/ai/usage — remaining daily tokens for the caller (best-effort).
 */

import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler, ApiError } from '@/lib/errors'
import { requireAiActor } from '@/lib/ai/auth/requireAiActor'
import { getAiSettings } from '@/lib/api/aiSettings'
import { startOfUtcDay } from '@/lib/ai/budget/limits'

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const artistId = req.nextUrl.searchParams.get('artist_id')
  const actor = await requireAiActor(req, {
    artistId,
    requireArtist: Boolean(artistId),
  })
  const settings = await getAiSettings(actor.serviceDb)
  const dayStart = startOfUtcDay().toISOString()
  const { data } = await actor.serviceDb
    .from('ai_token_budgets')
    .select('used_tokens, reserved_tokens, token_limit')
    .eq('scope', 'user')
    .eq('scope_id', actor.userId)
    .eq('period', 'day')
    .eq('period_start', dayStart)
    .maybeSingle()
  const limit = settings.tokenLimits.roles[actor.role].day
  const used = (data?.used_tokens ?? 0) + (data?.reserved_tokens ?? 0)
  const { data: creditSettings, error: creditSettingsError } = await actor.serviceDb.from('ai_credit_settings')
    .select('enabled, artist_monthly, editor_monthly, admin_monthly').eq('id', true).maybeSingle()
  if (creditSettingsError) throw new ApiError(503, 'Credit settings unavailable.', 'AI_CREDITS_UNAVAILABLE')
  const creditScope = actor.artistId ? 'artist' : actor.role
  const creditScopeId = actor.artistId ?? (actor.role === 'admin' ? 'label' : actor.userId)
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    .toISOString().slice(0, 10)
  const { data: creditAccount } = creditSettings?.enabled
    ? await actor.serviceDb.from('ai_credit_accounts')
      .select('monthly_allowance, used_credits, reserved_credits')
      .eq('scope', creditScope).eq('scope_id', creditScopeId)
      .eq('period_start', monthStart).maybeSingle()
    : { data: null }
  const creditLimit = creditSettings?.enabled
    ? creditAccount?.monthly_allowance ?? creditSettings[`${creditScope}_monthly` as 'artist_monthly' | 'editor_monthly' | 'admin_monthly']
    : 0
  const creditUsed = (creditAccount?.used_credits ?? 0) + (creditAccount?.reserved_credits ?? 0)
  return NextResponse.json({
    credits: { enabled: creditSettings?.enabled ?? false, period: 'month', limit: creditLimit,
      used: creditUsed, remaining: Math.max(0, creditLimit - creditUsed) },
    period: 'day',
    token_limit: data?.token_limit ?? limit,
    used_tokens: used,
    remaining_tokens: Math.max(0, (data?.token_limit ?? limit) - used),
  })
})
