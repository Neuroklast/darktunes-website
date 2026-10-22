import type { AiChatMessage, AiToolDefinition, AiUsage } from '@/lib/ai/types/provider'

/** chars/3.2 plus 15% — overestimate so we never under-reserve. */
const CHARS_PER_TOKEN = 3.2
const SAFETY = 1.15
const MESSAGE_OVERHEAD_TOKENS = 6

export interface EstimateBreakdown {
  system: number
  history: number
  user: number
  tools: number
  total_input: number
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil((text.length / CHARS_PER_TOKEN) * SAFETY)
}

export function estimateMessages(messages: AiChatMessage[]): EstimateBreakdown {
  let system = 0
  let history = 0
  let user = 0
  for (const message of messages) {
    const tools = message.tool_calls?.length
      ? estimateTokens(JSON.stringify(message.tool_calls))
      : 0
    const tokens =
      estimateTokens(message.content) +
      MESSAGE_OVERHEAD_TOKENS +
      tools +
      (message.tool_call_id ? 4 : 0)
    if (message.role === 'system') system += tokens
    else if (message.role === 'user') user += tokens
    else history += tokens
  }
  return { system, history, user, tools: 0, total_input: system + history + user }
}

export function estimateToolSchemas(tools: AiToolDefinition[] | undefined): number {
  if (!tools || tools.length === 0) return 0
  return tools.reduce((sum, tool) => {
    return sum + estimateTokens(tool.name) + estimateTokens(tool.description) + estimateTokens(JSON.stringify(tool.parameters))
  }, 0)
}

export function estimateInputTokens(
  messages: AiChatMessage[],
  tools?: AiToolDefinition[],
): EstimateBreakdown {
  const base = estimateMessages(messages)
  const toolsTokens = estimateToolSchemas(tools)
  return {
    ...base,
    tools: toolsTokens,
    total_input: base.total_input + toolsTokens,
  }
}

export function usageFromEstimate(input: number, output: number, reasoning = 0): AiUsage {
  return {
    input_tokens: input,
    output_tokens: output,
    reasoning_tokens: reasoning,
    total_tokens: input + output,
  }
}

export function preferProviderUsage(estimate: AiUsage, provider: AiUsage | null): AiUsage {
  if (!provider || provider.total_tokens <= 0) return estimate
  return provider
}

/** Provider usage is per completion. Preserve every round's total for the conversation. */
export function sumAiUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    reasoning_tokens: a.reasoning_tokens + b.reasoning_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
  }
}
