import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { AiUsage } from '@/lib/ai/types/provider'
import { ApiError } from '@/lib/errors'
import { CREDIT_EUR, calculateCredits, type ModelPrice } from './credits'

type Db = SupabaseClient<Database>
export interface CreditSettings {
  enabled: boolean
  buffer_percent: number
  artist_monthly: number
  editor_monthly: number
  admin_monthly: number
  model_prices: Record<string, { input_per_million_eur: number; output_per_million_eur: number; reasoning_per_million_eur?: number }>
}
export type CreditScope = 'artist' | 'editor' | 'admin'

/** No charges are issued until a verified admin explicitly enables credits and configures prices. */
export class CreditBudgetManager {
  private constructor(private readonly db: Db, readonly settings: CreditSettings) {}

  static async load(db: Db): Promise<CreditBudgetManager> {
    // Credit schema must be installed before enabling. A missing table is a setup error,
    // not an invitation to bypass an enabled limit.
    const { data, error } = await db.from('ai_credit_settings').select('*').eq('id', true).single()
    if (error || !data) throw new ApiError(503, 'AI credit accounting database is not installed.', 'AI_CREDITS_UNAVAILABLE')
    return new CreditBudgetManager(db, data as unknown as CreditSettings)
  }

  get enabled(): boolean { return this.settings.enabled }

  private price(model: string): ModelPrice {
    const config = this.settings.model_prices[model]
    if (!config) throw new ApiError(503, 'No credit price configured for this AI model.', 'AI_CREDITS_UNAVAILABLE')
    return {
      inputPerMillionEur: config.input_per_million_eur,
      outputPerMillionEur: config.output_per_million_eur,
      reasoningPerMillionEur: config.reasoning_per_million_eur,
    }
  }

  private charge(usage: Pick<AiUsage, 'input_tokens' | 'output_tokens' | 'reasoning_tokens'>, model: string): number {
    return calculateCredits(usage, this.price(model), { buffer: this.settings.buffer_percent / 100 })
  }

  private allowance(scope: CreditScope): number {
    return this.settings[`${scope}_monthly`]
  }

  async reserve(requestId: string, model: string, userId: string, artistId: string | null, role: 'artist' | 'editor' | 'admin', estimatedInput: number, maxOutput: number): Promise<void> {
    if (!this.enabled) return
    const scope: CreditScope = artistId ? 'artist' : role
    const scopeId = artistId ?? (role === 'admin' ? 'label' : userId)
    const rate = this.price(model)
    const worstCaseOutputRate = Math.max(rate.outputPerMillionEur, rate.reasoningPerMillionEur ?? 0)
    const credits = calculateCredits({ input_tokens: estimatedInput, output_tokens: maxOutput, reasoning_tokens: 0 }, { ...rate, outputPerMillionEur: worstCaseOutputRate }, { buffer: this.settings.buffer_percent / 100 })
    const { data, error } = await this.db.rpc('reserve_ai_credits', {
      p_request_id: requestId, p_scope: scope, p_scope_id: scopeId,
      p_user_id: userId, p_model: model, p_allowance: this.allowance(scope),
      p_credits: credits,
    })
    if (error) throw new ApiError(503, 'AI credit reservation failed.', 'AI_CREDITS_UNAVAILABLE')
    const result = data as { ok?: boolean; remaining?: number } | null
    if (!result?.ok) throw new ApiError(429, `AI credits exhausted (${result?.remaining ?? 0} remaining).`, 'AI_CREDITS_EXCEEDED')
  }

  async settle(requestId: string, usage: AiUsage, model: string, billable = true): Promise<void> {
    if (!this.enabled) return
    const price = this.price(model)
    const reasoning = Math.min(usage.reasoning_tokens, usage.output_tokens)
    const cost = (usage.input_tokens * price.inputPerMillionEur +
      (usage.output_tokens - reasoning) * price.outputPerMillionEur +
      reasoning * (price.reasoningPerMillionEur ?? price.outputPerMillionEur)) / 1_000_000
    const { error } = await this.db.rpc('settle_ai_credits', {
      p_request_id: requestId,
      p_charge: billable ? this.charge(usage, model) : 0,
      p_provider_cost: cost,
      p_usage: { ...usage, pricing: { ...price, buffer_percent: this.settings.buffer_percent, credit_eur: CREDIT_EUR } },
    })
    if (error) throw new ApiError(503, 'AI credit settlement failed.', 'AI_CREDITS_UNAVAILABLE')
  }
}

export function creditsToEur(credits: number): number { return credits * CREDIT_EUR }
