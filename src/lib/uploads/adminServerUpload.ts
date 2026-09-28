/**
 * Browser-side helper for admin/editor uploads through the server proxy
 * (`POST /api/upload` and compatible endpoints).
 *
 * Why this exists: Vercel rejects every function request body above 4.5 MB
 * with a plain-text `413 FUNCTION_PAYLOAD_TOO_LARGE` before the route handler
 * runs. Callers that sent larger files and then tried to `JSON.parse` that
 * response ended up showing a generic "server error" toast. This helper:
 *
 *  1. refuses to send files above {@link SERVER_UPLOAD_MAX_BYTES} and says so
 *     with the real size and limit (files are never compressed or converted),
 *  2. turns every failure into a specific, translated message naming the file,
 *     the cause and what the user can do.
 */

import type { ApiErrorResponse } from '@/lib/errors'
import { ERROR_CODES } from '@/lib/errorCodes'

/**
 * Largest file sent through the server proxy. Stays below Vercel's 4.5 MB body
 * cap (`VERCEL_FUNCTION_BODY_LIMIT_BYTES`) to leave room for multipart overhead.
 */
export const SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024

/** Error keys (namespace `errors`) this helper can produce. */
export type ServerUploadErrorKey =
  | 'AUTH_REQUIRED'
  | 'UPLOAD_EXCEEDS_SERVER_LIMIT'
  | 'UPLOAD_REJECTED_BY_PLATFORM'
  | 'UPLOAD_CONNECTION_LOST'
  | 'UPLOAD_FAILED_WITH_REASON'
  | 'UPLOAD_UNREADABLE_RESPONSE'
  | 'ERROR_REFERENCE'
  | (typeof ERROR_CODES)[number]

/** Compatible with `useTranslations('errors')`. */
export type ServerUploadTranslator = (
  key: ServerUploadErrorKey,
  values?: Record<string, string | number>,
) => string

/** Error whose message is already translated and safe to show in a toast. */
export class ServerUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerUploadError'
  }
}

/** Megabytes with at most one decimal and no trailing ".0" (4 MB, 6.5 MB). */
export function formatMegabytes(bytes: number): string {
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`
}

const SIZE_LIMIT = formatMegabytes(SERVER_UPLOAD_MAX_BYTES)

/**
 * Throws {@link ServerUploadError} with the real file size and limit when the
 * file cannot pass the server proxy. The file itself is never modified.
 */
export function assertServerUploadSize(file: File, t: ServerUploadTranslator): void {
  if (file.size <= SERVER_UPLOAD_MAX_BYTES) return
  throw new ServerUploadError(
    t('UPLOAD_EXCEEDS_SERVER_LIMIT', {
      filename: file.name,
      size: formatMegabytes(file.size),
      limit: SIZE_LIMIT,
    }),
  )
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Maps a failed upload response to a specific message. Exported for tests.
 */
export function describeUploadFailure(
  file: File,
  status: number,
  responseText: string,
  t: ServerUploadTranslator,
): string {
  const filename = file.name
  if (status === 413) {
    return t('UPLOAD_REJECTED_BY_PLATFORM', {
      filename,
      size: formatMegabytes(file.size),
      limit: SIZE_LIMIT,
    })
  }

  const body = parseJson(responseText) as Partial<ApiErrorResponse> | null
  const reference = body?.error_id ? ` ${t('ERROR_REFERENCE', { errorId: body.error_id })}` : ''
  if (body && typeof body === 'object') {
    const code = body.code
    if (code && (ERROR_CODES as readonly string[]).includes(code)) {
      return t('UPLOAD_FAILED_WITH_REASON', {
        filename,
        reason: t(code as (typeof ERROR_CODES)[number]) + reference,
      })
    }
    // 4xx route messages are written for users; 5xx messages may be internal.
    const detail = body.detail ?? body.error
    if (status < 500 && typeof detail === 'string' && detail.trim()) {
      return t('UPLOAD_FAILED_WITH_REASON', { filename, reason: detail })
    }
  }
  if (reference) {
    return t('UPLOAD_FAILED_WITH_REASON', { filename, reason: t('SERVER_ERROR') + reference })
  }
  return t('UPLOAD_UNREADABLE_RESPONSE', { filename, status })
}

export interface ServerUploadOptions {
  file: File
  token: string
  t: ServerUploadTranslator
  /** Defaults to `/api/upload`. */
  endpoint?: string
  /** Extra multipart fields (null/undefined values are skipped). */
  fields?: Record<string, string | null | undefined>
  onProgress?: (percent: number) => void
}

/**
 * Uploads one file through the server proxy and resolves with the parsed JSON
 * body. Oversized files are rejected before any request is sent. Rejects with
 * {@link ServerUploadError} only.
 */
export function uploadViaServer<T>({
  file,
  token,
  t,
  endpoint = '/api/upload',
  fields = {},
  onProgress,
}: ServerUploadOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    assertServerUploadSize(file, t)
    const formData = new FormData()
    formData.append('file', file)
    for (const [key, value] of Object.entries(fields)) {
      if (value != null) formData.append(key, value)
    }

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) onProgress?.(Math.round((ev.loaded / ev.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ServerUploadError(describeUploadFailure(file, xhr.status, xhr.responseText, t)))
        return
      }
      const body = parseJson(xhr.responseText)
      if (body === null) {
        reject(new ServerUploadError(t('UPLOAD_UNREADABLE_RESPONSE', { filename: file.name, status: xhr.status })))
        return
      }
      resolve(body as T)
    })
    xhr.addEventListener('error', () => {
      reject(new ServerUploadError(t('UPLOAD_CONNECTION_LOST', { filename: file.name })))
    })
    xhr.addEventListener('abort', () => {
      reject(new ServerUploadError(t('UPLOAD_CONNECTION_LOST', { filename: file.name })))
    })
    xhr.open('POST', endpoint)
    xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    xhr.send(formData)
  })
}
