import { describe, expect, it } from 'vitest'
import {
  assertServerUploadSize,
  describeUploadFailure,
  SERVER_UPLOAD_MAX_BYTES,
  ServerUploadError,
  type ServerUploadTranslator,
} from './adminServerUpload'

/** Echoes key + values so assertions can check which message and data were chosen. */
const t: ServerUploadTranslator = (key, values) =>
  values ? `${key} ${JSON.stringify(values)}` : key

function fileOfSize(name: string, type: string, bytes: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

const MB = 1024 * 1024

describe('assertServerUploadSize', () => {
  it('accepts files up to the limit', () => {
    expect(() => assertServerUploadSize(fileOfSize('logo.png', 'image/png', SERVER_UPLOAD_MAX_BYTES), t)).not.toThrow()
  })

  it('rejects a 6.5 MB PNG logo with file name, real size and limit (no compression)', () => {
    const file = fileOfSize('Ruined Conflict.png', 'image/png', 6.5 * MB)
    let err: unknown
    try {
      assertServerUploadSize(file, t)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ServerUploadError)
    expect((err as Error).message).toBe(
      'UPLOAD_EXCEEDS_SERVER_LIMIT {"filename":"Ruined Conflict.png","size":"6.5 MB","limit":"4 MB"}',
    )
  })
})

describe('describeUploadFailure', () => {
  const file = fileOfSize('logo.png', 'image/png', 6.5 * MB)

  it('explains the platform body-size rejection (plain-text 413)', () => {
    expect(describeUploadFailure(file, 413, 'Request Entity Too Large', t)).toBe(
      'UPLOAD_REJECTED_BY_PLATFORM {"filename":"logo.png","size":"6.5 MB","limit":"4 MB"}',
    )
  })

  it('uses the translated code and appends the error ID for 5xx', () => {
    const body = JSON.stringify({ code: 'SERVER_ERROR', error: 'x', error_id: 'ERR-ABCD1234' })
    expect(describeUploadFailure(file, 500, body, t)).toBe(
      'UPLOAD_FAILED_WITH_REASON {"filename":"logo.png","reason":"SERVER_ERROR ERROR_REFERENCE {\\"errorId\\":\\"ERR-ABCD1234\\"}"}',
    )
  })

  it('shows the route message for 4xx without a known code', () => {
    const body = JSON.stringify({ error: 'No file found in request' })
    expect(describeUploadFailure(file, 400, body, t)).toBe(
      'UPLOAD_FAILED_WITH_REASON {"filename":"logo.png","reason":"No file found in request"}',
    )
  })

  it('reports the HTTP status when the body is unreadable', () => {
    expect(describeUploadFailure(file, 502, '<html>Bad Gateway</html>', t)).toBe(
      'UPLOAD_UNREADABLE_RESPONSE {"filename":"logo.png","status":502}',
    )
  })
})
