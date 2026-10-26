export interface ModelPrice { inputPerMillionEur: number; outputPerMillionEur: number; reasoningPerMillionEur?: number }
export interface TokenUsage { input_tokens: number; output_tokens: number; reasoning_tokens: number }
export const CREDIT_EUR = 0.001
export const DEFAULT_COST_BUFFER = 0.25

/** Reasoning tokens may already be included in output_tokens depending on the provider. */
export function calculateCredits(
  usage: TokenUsage,
  price: ModelPrice,
  options: { buffer?: number; reasoningIncludedInOutput?: boolean } = {},
): number {
  const { buffer = DEFAULT_COST_BUFFER, reasoningIncludedInOutput = true } = options
  if (![usage.input_tokens, usage.output_tokens, usage.reasoning_tokens, price.inputPerMillionEur, price.outputPerMillionEur, price.reasoningPerMillionEur ?? 0, buffer].every(v => Number.isFinite(v) && v >= 0)) {
    throw new Error('Invalid usage or price')
  }
  const reasoning = usage.reasoning_tokens
  const output = reasoningIncludedInOutput ? Math.max(0, usage.output_tokens - reasoning) : usage.output_tokens
  const reasoningRate = price.reasoningPerMillionEur ?? price.outputPerMillionEur
  const eur = (usage.input_tokens * price.inputPerMillionEur + output * price.outputPerMillionEur + reasoning * reasoningRate) / 1_000_000
  return Math.ceil(eur * (1 + buffer) / CREDIT_EUR)
}
