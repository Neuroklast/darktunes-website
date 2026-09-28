/**
 * src/lib/clientErrors.ts
 *
 * Client-side error utilities for translating API error responses into the
 * user's active language using the i18n dictionary.
 *
 * Usage:
 *   const res = await fetch('/api/some-route', { ... })
 *   if (!res.ok) {
 *     const body = await res.json() as ApiErrorResponse
 *     const tErrors = useTranslations('errors')
 *     toast.error(getErrorMessage(body, tErrors))
 *     return
 *   }
 *
 * Rules:
 *  - NEVER surface internal details from the error body.
 *  - Always fall back to SERVER_ERROR if the code is unrecognised.
 *  - 5xx bodies carry `error_id`; it is always appended (ERROR_REFERENCE) so the
 *    user can hand the admins an ID that matches the `app_logs` entry.
 *  - No generic messages without context — see AGENTS.md → "Error messages".
 */

import type { Dictionary } from '@/i18n/types'
import type { ApiErrorBody } from './errors'
import { ERROR_CODES } from './errorCodes'

type ErrorsTranslator = (
  code: keyof Dictionary['errors'],
  values?: Record<string, string | number>,
) => string

function withErrorReference(message: string, body: ApiErrorBody, tErrors: ErrorsTranslator): string {
  if (!body.error_id) return message
  return `${message} ${tErrors('ERROR_REFERENCE', { errorId: body.error_id })}`
}

/**
 * Returns the translated error message for an API error response.
 *
 * 1. Checks if the response `code` matches a known ErrorCode.
 * 2. If so, returns the dictionary translation for that code.
 * 3. Otherwise falls back to `errors.SERVER_ERROR`.
 * 4. Appends the error ID (`error_id`) when the server sent one.
 *
 * @param body    - Parsed JSON body from a non-ok API response.
 * @param tErrors - `useTranslations('errors')` (or compatible translator).
 */
export function getErrorMessage(
  body: ApiErrorBody,
  tErrors: ErrorsTranslator,
): string {
  const code = body.code
  const message = code && (ERROR_CODES as readonly string[]).includes(code)
    ? tErrors(code as keyof Dictionary['errors'])
    : tErrors('SERVER_ERROR')
  return withErrorReference(message, body, tErrors)
}

/**
 * Parses the JSON body of an API response and calls `getErrorMessage`.
 * Returns `errors.RESPONSE_UNREADABLE` (with the HTTP status) if JSON parsing fails.
 *
 * @param res     - A non-ok `Response` object from `fetch`.
 * @param tErrors - `useTranslations('errors')` (or compatible translator).
 */
export async function getResponseErrorMessage(
  res: Response,
  tErrors: ErrorsTranslator,
): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody
    return getErrorMessage(body, tErrors)
  } catch {
    return tErrors('RESPONSE_UNREADABLE', { status: res.status })
  }
}

/** Like `getErrorMessage` but accepts only the `errors` slice of the dictionary. */
export function getErrorMessageFromErrors(
  body: ApiErrorBody,
  errors: Dictionary['errors'],
): string {
  const code = body.code
  const message = code && (ERROR_CODES as readonly string[]).includes(code)
    ? errors[code as keyof Dictionary['errors']]
    : errors.SERVER_ERROR
  if (!body.error_id) return message
  return `${message} ${errors.ERROR_REFERENCE.replace('{errorId}', body.error_id)}`
}
