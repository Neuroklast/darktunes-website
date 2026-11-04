export type ErrorClass =
  | 'user_validation'
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'external_api'
  | 'storage'
  | 'sync'
  | 'config'
  | 'client'
  | 'server'
  | 'unknown'

export function classifyError(input: {
  httpStatus?: number | null
  message: string
  source?: string | null
}): ErrorClass {
  const status = input.httpStatus ?? 0
  const text = `${input.source ?? ''} ${input.message}`.toLowerCase()
  if (status === 401 || /unauthorized|session expired/.test(text)) return 'auth'
  if (status === 403 || /forbidden|permission/.test(text)) return 'permission'
  if (status === 429 || /rate limit/.test(text)) return 'rate_limit'
  if (status === 400 || status === 422 || /validation|invalid json/.test(text)) return 'user_validation'
  if (/r2|upload|storage|s3/.test(text)) return 'storage'
  if (/sync|spotify|discogs/.test(text)) return 'sync'
  if (/not configured|missing key/.test(text)) return 'config'
  if (input.source === 'ui' || input.source === 'client') return 'client'
  if (status >= 500) return 'server'
  return 'unknown'
}

export function isSoftwareDefect(classification: ErrorClass): boolean {
  return classification === 'server' || classification === 'storage' || classification === 'sync' || classification === 'config'
}
