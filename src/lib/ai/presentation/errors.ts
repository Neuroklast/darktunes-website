import type { ErrorCode } from '@/lib/errorCodes'

export type AssistantAudience = 'artist' | 'editor' | 'admin'

const PROVIDER_FAILURES = new Set<string>([
  'AI_PROVIDER_INVALID_KEY',
  'AI_PROVIDER_MODEL_UNAVAILABLE',
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_NETWORK_ERROR',
  'AI_PROVIDER_TLS_ERROR',
  'AI_PROVIDER_INVALID_RESPONSE',
  'AI_PROVIDER_TOOL_CALL_UNSUPPORTED',
  'AI_PROVIDER_UNAVAILABLE',
])

const DISABLED_CODES = new Set<string>(['AI_DISABLED', 'AI_DISABLED_FOR_ROLE'])

const RETRY_CODES = new Set<string>([
  'AI_EMPTY_RESPONSE',
  'AI_OUTPUT_TRUNCATED',
  'AI_REASONING_EXHAUSTED',
  'AI_STREAM_INCOMPLETE',
])

const ACCESS_CODES = new Set<string>(['AI_TOOL_FORBIDDEN'])

function audienceSuffix(audience: AssistantAudience): 'ARTIST' | 'STAFF' | 'ADMIN' {
  return audience === 'artist' ? 'ARTIST' : audience === 'editor' ? 'STAFF' : 'ADMIN'
}

/**
 * Maps internal error codes to a role-appropriate, non-technical message key.
 *
 * Artists and editors never see provider names, API-key instructions, or admin
 * navigation paths. Admins get an action ("check the configuration") without
 * internals; Technical Operations reads the raw code and detail in the protected
 * AI management area instead.
 */
export function assistantErrorKey(code: string, audience: AssistantAudience): string {
  const suffix = audienceSuffix(audience)

  if (PROVIDER_FAILURES.has(code)) return `AI_UNAVAILABLE_${suffix}`
  if (code === 'AI_NOT_CONFIGURED') return `AI_NOT_CONFIGURED_${suffix}`
  if (DISABLED_CODES.has(code)) return `AI_DISABLED_${suffix}`
  if (RETRY_CODES.has(code)) return `AI_RETRY_${suffix}`
  if (code === 'AI_BUDGET_EXCEEDED' || code === 'AI_CREDITS_EXCEEDED') return `AI_LIMIT_${suffix}`
  if (ACCESS_CODES.has(code)) return audience === 'admin' ? code : `AI_ACCESS_${suffix}`

  return (code as ErrorCode)
}
