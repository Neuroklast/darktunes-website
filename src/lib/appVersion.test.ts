import { describe, expect, it } from 'vitest'
import {
  formatAppVersionLabel,
  getAppVersion,
  getAppVersionInfo,
  resolveCommitSha,
} from './appVersion'

describe('appVersion', () => {
  it('reads a semver-like version from package.json', () => {
    const version = getAppVersion()
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('prefers VERCEL_GIT_COMMIT_SHA over GITHUB_SHA', () => {
    const resolved = resolveCommitSha({
      VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890abcdef1234567890abcdef12',
      GITHUB_SHA: '1111111111111111111111111111111111111111',
    })
    expect(resolved.full).toBe('abcdef1234567890abcdef1234567890abcdef12')
    expect(resolved.short).toBe('abcdef1')
  })

  it('falls back to GITHUB_SHA then NEXT_PUBLIC_GIT_COMMIT', () => {
    expect(
      resolveCommitSha({
        GITHUB_SHA: 'bbbbbbbccccccccccccccccccccccccccccccc',
      }).short,
    ).toBe('bbbbbbb')

    expect(
      resolveCommitSha({
        NEXT_PUBLIC_GIT_COMMIT: 'cccccccddddddddddddddddddddddddddddddd',
      }).short,
    ).toBe('ccccccc')
  })

  it('rejects invalid commit strings', () => {
    expect(resolveCommitSha({ VERCEL_GIT_COMMIT_SHA: 'not-a-sha' }).full).toBeNull()
    expect(resolveCommitSha({ VERCEL_GIT_COMMIT_SHA: 'abc' }).full).toBeNull()
  })

  it('formats label with and without commit', () => {
    const version = getAppVersion()
    expect(formatAppVersionLabel({ version, commit: null, commitFull: null })).toBe(
      `v${version}`,
    )
    expect(
      formatAppVersionLabel({
        version,
        commit: 'deadbee',
        commitFull: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      }),
    ).toBe(`v${version} · deadbee`)
  })

  it('getAppVersionInfo composes version and env commit', () => {
    const info = getAppVersionInfo({
      VERCEL_GIT_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
    })
    expect(info.version).toBe(getAppVersion())
    expect(info.commit).toBe('0123456')
    expect(info.commitFull).toBe('0123456789abcdef0123456789abcdef01234567')
  })
})
