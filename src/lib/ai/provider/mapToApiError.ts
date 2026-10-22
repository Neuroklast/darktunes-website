import { ApiError, buildApiError } from '@/lib/errors'
import type { ErrorCode } from '@/lib/errorCodes'
import { isAiProviderError } from '@/lib/ai/provider/errors'
import type { AiProviderErrorCode } from '@/lib/ai/types/provider'

const PROVIDER_TO_API: Record<AiProviderErrorCode, ErrorCode> = {
  INVALID_KEY: 'AI_PROVIDER_INVALID_KEY',
  MODEL_UNAVAILABLE: 'AI_PROVIDER_MODEL_UNAVAILABLE',
  RATE_LIMITED: 'AI_PROVIDER_RATE_LIMITED',
  TIMEOUT: 'AI_PROVIDER_TIMEOUT',
  NETWORK_ERROR: 'AI_PROVIDER_NETWORK_ERROR',
  TLS_ERROR: 'AI_PROVIDER_TLS_ERROR',
  INVALID_RESPONSE: 'AI_PROVIDER_INVALID_RESPONSE',
  TOOL_CALL_UNSUPPORTED: 'AI_PROVIDER_TOOL_CALL_UNSUPPORTED',
  PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  EMPTY_RESPONSE: 'AI_EMPTY_RESPONSE',
  OUTPUT_TRUNCATED: 'AI_OUTPUT_TRUNCATED',
  STREAM_INCOMPLETE: 'AI_STREAM_INCOMPLETE',
  REASONING_ONLY: 'AI_REASONING_EXHAUSTED',
}

const PROVIDER_HTTP_STATUS: Record<AiProviderErrorCode, number> = {
  INVALID_KEY: 401,
  MODEL_UNAVAILABLE: 422,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  NETWORK_ERROR: 503,
  TLS_ERROR: 503,
  INVALID_RESPONSE: 502,
  TOOL_CALL_UNSUPPORTED: 422,
  PROVIDER_UNAVAILABLE: 503,
  EMPTY_RESPONSE: 502,
  OUTPUT_TRUNCATED: 502,
  STREAM_INCOMPLETE: 502,
  REASONING_ONLY: 502,
}

export function apiErrorFromProvider(error: unknown): ApiError {
  if (!isAiProviderError(error)) {
    return buildApiError('AI_PROVIDER_UNAVAILABLE', 503)
  }
  const code = PROVIDER_TO_API[error.code]
  const status = error.httpStatus && error.httpStatus >= 400
    ? error.httpStatus
    : PROVIDER_HTTP_STATUS[error.code]
  return buildApiError(code, status)
}
