import type { ModelCapabilities } from '@/lib/ai/types/provider'

export interface ModelHealth {
  ok: boolean
  tested_at: string | null
  supports_streaming: boolean
  supports_tools: boolean
  supports_enable_thinking: boolean
  supports_low_effort: boolean
}

export interface StoredCapabilities {
  models: Record<string, Partial<ModelCapabilities>>
  health: Record<string, ModelHealth>
}

const CAPABILITY_KEYS: Array<keyof ModelCapabilities> = [
  'supports_streaming',
  'supports_tools',
  'supports_tools_with_streaming',
  'supports_enable_thinking',
  'supports_low_effort',
  'supports_reasoning_budget',
  'reasoning_budget_path',
  'supports_reasoning_effort',
  'supports_force_nonempty_content',
  'supports_stream_options',
]

/**
 * Accepts the structured v2 shape and the legacy flat model map written by the
 * first connection-test implementation.
 */
export function parseStoredCapabilities(raw: unknown): StoredCapabilities {
  if (!raw || typeof raw !== 'object') return { models: {}, health: {} }
  const value = raw as {
    models?: unknown
    health?: unknown
  }
  if (value.models && typeof value.models === 'object') {
    return {
      models: sanitizeModelMap(value.models),
      health: sanitizeHealthMap(value.health),
    }
  }
  return { models: sanitizeModelMap(raw), health: {} }
}

function sanitizeModelMap(raw: unknown): Record<string, Partial<ModelCapabilities>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, Partial<ModelCapabilities>> = {}
  for (const [model, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const candidate = value as Record<string, unknown>
    const partial: Partial<ModelCapabilities> = {}
    for (const key of CAPABILITY_KEYS) {
      if (key === 'reasoning_budget_path') {
        const path = candidate[key]
        if (
          path === 'top_level' ||
          path === 'chat_template_kwargs' ||
          path === 'custom_params' ||
          path === 'none'
        ) {
          partial.reasoning_budget_path = path
        }
      } else if (typeof candidate[key] === 'boolean') {
        ;(partial as Record<string, unknown>)[key] = candidate[key]
      }
    }
    if (Object.keys(partial).length > 0) out[model] = partial
  }
  return out
}

function sanitizeHealthMap(raw: unknown): Record<string, ModelHealth> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, ModelHealth> = {}
  for (const [model, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const candidate = value as Record<string, unknown>
    out[model] = {
      ok: candidate.ok === true,
      tested_at: typeof candidate.tested_at === 'string' ? candidate.tested_at : null,
      supports_streaming: candidate.supports_streaming === true,
      supports_tools: candidate.supports_tools === true,
      supports_enable_thinking: candidate.supports_enable_thinking === true,
      supports_low_effort: candidate.supports_low_effort === true,
    }
  }
  return out
}

export function isModelVerified(
  health: Record<string, ModelHealth>,
  model: string,
  required: Array<keyof Pick<ModelHealth, 'supports_streaming' | 'supports_tools' | 'supports_enable_thinking'>>,
): boolean {
  const entry = health[model]
  if (!entry?.ok) return false
  return required.every((key) => entry[key] === true)
}
