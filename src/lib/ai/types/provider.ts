/**
 * Provider-agnostic AI types. Domain code must not import NVIDIA-specific shapes.
 */

export const AI_PROVIDER_IDS = ['nvidia', 'groq', 'gemini', 'openrouter', 'cerebras', 'cloudflare', 'openai_compatible', 'mock'] as const
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]

export const AI_MODEL_ROLES = ['fast', 'reasoning'] as const
export type AiModelRole = (typeof AI_MODEL_ROLES)[number]

export const DEFAULT_AI_MODELS = {
  fast: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  reasoning: 'nvidia/nemotron-3-super-120b-a12b',
} as const

export type AiTurnMode = 'auto' | 'fast' | 'deep'
export type AiReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export const NVIDIA_CHAT_COMPLETIONS_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
export const NVIDIA_API_BASE_URL = 'https://integrate.api.nvidia.com/v1'

export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface AiChatMessage {
  role: AiMessageRole
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: AiToolCall[]
}

export interface AiToolCall {
  id: string
  name: string
  arguments: string
}

export interface AiToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface AiUsage {
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  total_tokens: number
}

export const EMPTY_AI_USAGE: AiUsage = {
  input_tokens: 0,
  output_tokens: 0,
  reasoning_tokens: 0,
  total_tokens: 0,
}

export interface ModelCapabilities {
  model_id: string
  role: AiModelRole
  supports_streaming: boolean
  supports_tools: boolean
  supports_tools_with_streaming: boolean
  supports_enable_thinking: boolean
  supports_low_effort: boolean
  supports_reasoning_budget: boolean
  reasoning_budget_path: 'top_level' | 'chat_template_kwargs' | 'custom_params' | 'none'
  supports_reasoning_effort: boolean
  supports_force_nonempty_content: boolean
  supports_stream_options: boolean
  default_temperature: number
  default_top_p: number
  max_output_tokens: number
}

export interface AiCompletionRequest {
  request_id: string
  model: string
  messages: AiChatMessage[]
  tools?: AiToolDefinition[]
  tool_choice?: 'auto' | 'none' | 'required'
  stream?: boolean
  max_tokens: number
  temperature?: number
  top_p?: number
  enable_thinking?: boolean
  low_effort?: boolean
  reasoning_budget?: number
  reasoning_effort?: AiReasoningEffort
  force_nonempty_content?: boolean
  timeout_ms?: number
  /** Chat retries transient failures. Connection tests set this to false. */
  retry?: boolean
}

export interface AiCompletion {
  request_id: string
  model: string
  content: string
  reasoning_content: string | null
  tool_calls: AiToolCall[]
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'cancelled' | 'unknown'
  usage: AiUsage
  latency_ms: number
  retry_count: number
}

export type AiStreamEvent =
  | { type: 'open'; retry_count: number }
  | { type: 'delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call_delta'; tool_call: Partial<AiToolCall> & { index: number } }
  | { type: 'usage'; usage: AiUsage }
  | { type: 'done'; completion: AiCompletion }

export interface ProviderConfigStatus {
  configured: boolean
  provider: AiProviderId
  base_url: string
  models: { fast: string; reasoning: string }
}

export const AI_PROVIDER_ERROR_CODES = [
  'INVALID_KEY',
  'MODEL_UNAVAILABLE',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK_ERROR',
  'TLS_ERROR',
  'INVALID_RESPONSE',
  'TOOL_CALL_UNSUPPORTED',
  'PROVIDER_UNAVAILABLE',
  'EMPTY_RESPONSE',
  'OUTPUT_TRUNCATED',
  'STREAM_INCOMPLETE',
  'REASONING_ONLY',
] as const

export type AiProviderErrorCode = (typeof AI_PROVIDER_ERROR_CODES)[number]
