import { describe, expect, it } from 'vitest'
import {
  createRequestId,
  isValidRequestId,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from './requestId'

describe('requestId', () => {
  it('accepts opaque tokens in the allowed charset', () => {
    expect(isValidRequestId('a'.repeat(8))).toBe(true)
    expect(isValidRequestId(crypto.randomUUID())).toBe(true)
    expect(isValidRequestId('short')).toBe(false)
    expect(isValidRequestId('has spacexx')).toBe(false)
    expect(isValidRequestId('bad@id!!!')).toBe(false)
  })

  it('reuses a valid incoming x-request-id', () => {
    const id = crypto.randomUUID()
    const headers = new Headers({ [REQUEST_ID_HEADER]: id })
    expect(resolveRequestId(headers)).toBe(id)
  })

  it('mints a new id when missing or invalid', () => {
    expect(isValidRequestId(resolveRequestId(new Headers()))).toBe(true)
    expect(isValidRequestId(resolveRequestId(new Headers({ [REQUEST_ID_HEADER]: 'x' })))).toBe(
      true,
    )
  })

  it('createRequestId returns a UUID-shaped value', () => {
    expect(createRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })
})
