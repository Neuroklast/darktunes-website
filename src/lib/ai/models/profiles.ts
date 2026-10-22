import {
  DEFAULT_AI_MODELS,
  type AiModelRole,
  type ModelCapabilities,
} from '@/lib/ai/types/provider'

export const FAST_MODEL_ID = DEFAULT_AI_MODELS.fast
export const REASONING_MODEL_ID = DEFAULT_AI_MODELS.reasoning

/**
 * Known profiles are conservative. Optional payload extras are only sent when
 * the profile or a successful connection test says the endpoint accepts them.
 */
const FAST_PROFILE: ModelCapabilities = {
  model_id: FAST_MODEL_ID,
  role: 'fast',
  supports_streaming: true,
  supports_tools: true,
  supports_tools_with_streaming: true,
  supports_enable_thinking: true,
  supports_low_effort: false,
  supports_reasoning_budget: false,
  reasoning_budget_path: 'none',
  supports_reasoning_effort: false,
  supports_force_nonempty_content: true,
  supports_stream_options: true,
  default_temperature: 1,
  default_top_p: 0.95,
  max_output_tokens: 1200,
}

const REASONING_PROFILE: ModelCapabilities = {
  model_id: REASONING_MODEL_ID,
  role: 'reasoning',
  supports_streaming: true,
  supports_tools: true,
  supports_tools_with_streaming: true,
  supports_enable_thinking: true,
  supports_low_effort: true,
  supports_reasoning_budget: true,
  reasoning_budget_path: 'top_level',
  supports_reasoning_effort: true,
  supports_force_nonempty_content: true,
  supports_stream_options: true,
  default_temperature: 1,
  default_top_p: 0.95,
  max_output_tokens: 8192,
}

const CONSERVATIVE_PROFILE: Omit<ModelCapabilities, 'model_id' | 'role'> = {
  supports_streaming: true,
  supports_tools: false,
  supports_tools_with_streaming: false,
  supports_enable_thinking: false,
  supports_low_effort: false,
  supports_reasoning_budget: false,
  reasoning_budget_path: 'none',
  supports_reasoning_effort: false,
  supports_force_nonempty_content: false,
  supports_stream_options: true,
  default_temperature: 1,
  default_top_p: 0.95,
  max_output_tokens: 1200,
}

const PROFILES_BY_ID: Record<string, ModelCapabilities> = {
  [FAST_MODEL_ID]: FAST_PROFILE,
  [REASONING_MODEL_ID]: REASONING_PROFILE,
}

export function getModelProfile(modelId: string): ModelCapabilities {
  const known = PROFILES_BY_ID[modelId]
  if (known) return { ...known }
  const role = inferRoleFromModelId(modelId)
  return {
    ...CONSERVATIVE_PROFILE,
    model_id: modelId,
    role,
    max_output_tokens: role === 'reasoning' ? 8192 : CONSERVATIVE_PROFILE.max_output_tokens,
  }
}

export function getModelProfileForRole(role: AiModelRole): ModelCapabilities {
  return role === 'reasoning' ? { ...REASONING_PROFILE } : { ...FAST_PROFILE }
}

export function inferRoleFromModelId(modelId: string): AiModelRole {
  return /(?:super|ultra|reasoning|think)/i.test(modelId) ? 'reasoning' : 'fast'
}

export function mergeDiscoveredCapabilities(
  base: ModelCapabilities,
  discovered: Partial<Pick<
    ModelCapabilities,
    | 'supports_tools'
    | 'supports_tools_with_streaming'
    | 'supports_enable_thinking'
    | 'supports_low_effort'
    | 'supports_reasoning_budget'
    | 'reasoning_budget_path'
    | 'supports_reasoning_effort'
    | 'supports_force_nonempty_content'
    | 'supports_stream_options'
    | 'supports_streaming'
  >>,
): ModelCapabilities {
  return { ...base, ...discovered }
}

/** Fast-model simple turns keep thinking off so output tokens stay on the answer. */
export function shouldEnableThinking(
  role: AiModelRole,
  task: 'simple' | 'complex',
  capabilities?: ModelCapabilities,
): boolean {
  if (capabilities && !capabilities.supports_enable_thinking) return false
  if (role === 'reasoning') return true
  return task === 'complex'
}
