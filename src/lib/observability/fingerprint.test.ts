import { describe, it, expect } from 'vitest'
import { buildLogFingerprint, buildSimpleFingerprint, normalizeForFingerprint } from './fingerprint'

describe('buildLogFingerprint', () => {
  it('is stable for the same failure despite volatile ids and line numbers', () => {
    const a = buildLogFingerprint({
      event: 'request.error',
      errorName: 'Error',
      message: 'Failed for user 12345',
      stack: 'Error: x\n    at handler (/app/x.ts:10:5)',
    })
    const b = buildLogFingerprint({
      event: 'request.error',
      errorName: 'Error',
      message: 'Failed for user 98765',
      stack: 'Error: x\n    at handler (/app/x.ts:99:1)',
    })
    expect(a).toBe(b)
    expect(a).toMatch(/^fp_[0-9a-f]{16}$/)
  })

  it('differs across events and error names', () => {
    const base = { errorName: 'Error', message: 'x', stack: null }
    expect(buildLogFingerprint({ event: 'a', ...base })).not.toBe(
      buildLogFingerprint({ event: 'b', ...base }),
    )
    expect(buildLogFingerprint({ event: 'a', ...base })).not.toBe(
      buildLogFingerprint({ event: 'a', errorName: 'TypeError', message: 'x', stack: null }),
    )
  })
})

describe('buildSimpleFingerprint', () => {
  it('is stable and ignores null parts', () => {
    expect(buildSimpleFingerprint('api', 'error', 'boom', '/x')).toBe(
      buildSimpleFingerprint('api', 'error', 'boom', '/x'),
    )
    expect(buildSimpleFingerprint('api', 'error', 'boom')).toMatch(/^fp_[0-9a-f]{16}$/)
  })
})

describe('normalizeForFingerprint', () => {
  it('redacts uuids, emails and numbers', () => {
    const out = normalizeForFingerprint(
      'user 3f2b1c4d-0000-4000-8000-000000000000 a@b.com 12345',
    )
    expect(out).toBe('user <id> <mail> <n>')
  })
})
