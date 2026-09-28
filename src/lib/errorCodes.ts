/**
 * src/lib/errorCodes.ts
 *
 * Typed error codes shared between server-side Route Handlers (ApiError) and
 * client-side helpers (getErrorMessage). Adding a code here automatically
 * requires a matching key in src/i18n/messages/en/errors.json (enforced by the
 * Dictionary type in src/i18n/types.ts).
 *
 * Rules for error messages:
 *  - NEVER show generic messages ("Something went wrong", "Please try again
 *    later"). Every message states what failed, why, and what the user can do
 *    (see AGENTS.md → "Error messages").
 *  - NEVER expose env-var names, DB error messages, stack traces, or other
 *    internal implementation detail in user-visible strings.
 *  - Every code maps to a safe, user-friendly sentence in the `errors` namespace
 *    of both locale message bundles (en + de).
 */

export const ERROR_CODES = [
  'AUTH_REQUIRED',
  'AUTH_TOKEN_INVALID',
  'AUTH_TOKEN_MISSING',
  'FORBIDDEN',
  'FORBIDDEN_ADMIN_ONLY',
  'FORBIDDEN_NO_ARTIST',
  'FORBIDDEN_JOURNALIST_ONLY',
  'NOT_FOUND',
  'CONFLICT',
  'UPLOAD_TOO_LARGE',
  'UPLOAD_WRONG_TYPE',
  'UPLOAD_NO_FILE',
  'UPLOAD_PARSE_FAILED',
  'STORAGE_QUOTA_EXCEEDED',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'EMAIL_SEND_FAILED',
  'EMAIL_NOT_CONFIGURED',
  'EXTERNAL_API_ERROR',
  'APIFY_NOT_CONFIGURED',
  'APIFY_NO_TARGETS',
  'APIFY_BUDGET_EXCEEDED',
  'APIFY_RUN_FAILED',
  'APIFY_TIMEOUT',
  'SERVER_ERROR',
  'CONFIG_ERROR',
  'DB_ERROR',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * Safe English fallback messages for each error code.
 * These are the strings returned in the API JSON body (`error` field) so
 * that API consumers without access to the i18n dictionary still get a
 * readable, non-technical message.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  AUTH_REQUIRED: 'Please sign in to continue.',
  AUTH_TOKEN_INVALID: 'Your session has expired. Please sign in again.',
  AUTH_TOKEN_MISSING: 'Authentication is required. Please sign in.',
  FORBIDDEN: "You don't have permission to do that.",
  FORBIDDEN_ADMIN_ONLY: 'Admin access is required.',
  FORBIDDEN_NO_ARTIST: 'Your account is not linked to an artist profile yet.',
  FORBIDDEN_JOURNALIST_ONLY: 'Only journalists can perform this action.',
  NOT_FOUND: 'The requested item could not be found.',
  CONFLICT: 'A duplicate entry already exists.',
  UPLOAD_TOO_LARGE: 'The file is too large. Please choose a smaller file.',
  UPLOAD_WRONG_TYPE: 'This file type is not supported.',
  UPLOAD_NO_FILE: 'No file was attached. Please select a file and try again.',
  UPLOAD_PARSE_FAILED: 'The file could not be read. Please try again.',
  STORAGE_QUOTA_EXCEEDED: 'Your storage quota is full. Please contact support.',
  VALIDATION_ERROR: 'Some fields contain invalid values. Please check the form.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  EMAIL_SEND_FAILED: 'Your message could not be sent. Please try again later.',
  EMAIL_NOT_CONFIGURED: 'The email service is not available at this time.',
  EXTERNAL_API_ERROR: 'An external service is currently unavailable. Please try again later.',
  APIFY_NOT_CONFIGURED:
    'Apify is not configured. Add your Apify API token under Admin → API Keys.',
  APIFY_NO_TARGETS:
    'No visible artists or releases with a Spotify link were found to sync.',
  APIFY_BUDGET_EXCEEDED:
    'Monthly Apify free budget exhausted. Try again next month or reduce the sync scope.',
  APIFY_RUN_FAILED:
    'Spotify play-count scrape failed on Apify. Check the Apify Console for run details.',
  APIFY_TIMEOUT:
    'The Apify scrape timed out before finishing. Partial progress may be saved; re-run to continue.',
  SERVER_ERROR: 'Unexpected server error while processing this request.',
  CONFIG_ERROR:
    'This feature is not set up on the server: a required setting is missing or invalid. Tell the label team.',
  DB_ERROR: 'The database could not complete this operation.',
}
