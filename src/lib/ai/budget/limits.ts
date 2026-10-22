export const DEFAULT_TOKEN_LIMITS = {
  fast: {
    max_input_tokens: 6000,
    max_output_tokens: 1200,
    max_turn_tokens: 10_000,
  },
  reasoning: {
    max_input_tokens: 12_000,
    max_output_tokens: 8192,
    max_turn_tokens: 25_000,
    max_reasoning_tokens: 4096,
  },
  roles: {
    artist: { day: 30_000, month: 250_000 },
    editor: { day: 50_000, month: 400_000 },
    admin: { day: 120_000, month: 1_000_000 },
  },
  global: { day: 300_000, month: 3_000_000 },
  max_conversation_context_tokens: 8000,
  max_tool_rounds: { fast: 4, reasoning: 6 },
} as const

export type TokenLimits = {
  fast: { max_input_tokens: number; max_output_tokens: number; max_turn_tokens: number }
  reasoning: {
    max_input_tokens: number
    max_output_tokens: number
    max_turn_tokens: number
    max_reasoning_tokens: number
  }
  roles: Record<'artist' | 'editor' | 'admin', { day: number; month: number }>
  global: { day: number; month: number }
  max_conversation_context_tokens: number
  max_tool_rounds: { fast: number; reasoning: number }
}

export function parseTokenLimits(raw: unknown): TokenLimits {
  const fallback: TokenLimits = {
    fast: { ...DEFAULT_TOKEN_LIMITS.fast },
    reasoning: { ...DEFAULT_TOKEN_LIMITS.reasoning },
    roles: {
      artist: { ...DEFAULT_TOKEN_LIMITS.roles.artist },
      editor: { ...DEFAULT_TOKEN_LIMITS.roles.editor },
      admin: { ...DEFAULT_TOKEN_LIMITS.roles.admin },
    },
    global: { ...DEFAULT_TOKEN_LIMITS.global },
    max_conversation_context_tokens: DEFAULT_TOKEN_LIMITS.max_conversation_context_tokens,
    max_tool_rounds: { ...DEFAULT_TOKEN_LIMITS.max_tool_rounds },
  }
  if (!raw || typeof raw !== 'object') return fallback
  const value = raw as Record<string, unknown>
  return {
    fast: mergePair(fallback.fast, value.fast),
    reasoning: mergePair(fallback.reasoning, value.reasoning),
    roles: {
      artist: mergePair(fallback.roles.artist, nested(value.roles, 'artist')),
      editor: mergePair(fallback.roles.editor, nested(value.roles, 'editor')),
      admin: mergePair(fallback.roles.admin, nested(value.roles, 'admin')),
    },
    global: mergePair(fallback.global, value.global),
    max_conversation_context_tokens:
      asPositiveInt(value.max_conversation_context_tokens) ?? fallback.max_conversation_context_tokens,
    max_tool_rounds: mergePair(fallback.max_tool_rounds, value.max_tool_rounds),
  }
}

function nested(raw: unknown, key: string): unknown {
  if (!raw || typeof raw !== 'object') return undefined
  return (raw as Record<string, unknown>)[key]
}

function mergePair<T extends Record<string, number>>(base: T, raw: unknown): T {
  if (!raw || typeof raw !== 'object') return { ...base }
  const next = { ...base }
  for (const key of Object.keys(base) as Array<keyof T>) {
    const value = asPositiveInt((raw as Record<string, unknown>)[String(key)])
    if (value !== null) next[key] = value as T[keyof T]
  }
  return next
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
