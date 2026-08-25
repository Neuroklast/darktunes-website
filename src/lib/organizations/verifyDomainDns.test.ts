import { describe, expect, it, vi } from 'vitest'
import {
  domainVerificationHostnames,
  verifyDomainTxtToken,
} from '@/lib/organizations/verifyDomainDns'

describe('domainVerificationHostnames', () => {
  it('strips www and includes challenge host', () => {
    expect(domainVerificationHostnames('WWW.Label.COM')).toEqual([
      'label.com',
      '_darktunes-verify.label.com',
    ])
  })
})

describe('verifyDomainTxtToken', () => {
  const token = 'darktunes-verify=abc123'

  it('matches TXT on apex domain', async () => {
    const resolveTxt = vi.fn(async (host: string) => {
      if (host === 'label.com') return [[token]]
      throw Object.assign(new Error('ENODATA'), { code: 'ENODATA' })
    })
    const result = await verifyDomainTxtToken('label.com', token, resolveTxt)
    expect(result.ok).toBe(true)
    expect(result.matchedHost).toBe('label.com')
  })

  it('matches TXT on _darktunes-verify host', async () => {
    const resolveTxt = vi.fn(async (host: string) => {
      if (host === '_darktunes-verify.label.com') return [['prefix ', token, ' suffix']]
      throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
    })
    const result = await verifyDomainTxtToken('www.label.com', token, resolveTxt)
    expect(result.ok).toBe(true)
    expect(result.matchedHost).toBe('_darktunes-verify.label.com')
  })

  it('fails when token is missing', async () => {
    const resolveTxt = vi.fn(async () => [['unrelated-txt']])
    const result = await verifyDomainTxtToken('label.com', token, resolveTxt)
    expect(result.ok).toBe(false)
    expect(result.matchedHost).toBeNull()
  })

  it('fails gracefully when DNS has no data', async () => {
    const resolveTxt = vi.fn(async () => {
      throw Object.assign(new Error('queryTxt ENODATA'), { code: 'ENODATA' })
    })
    const result = await verifyDomainTxtToken('label.com', token, resolveTxt)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ENODATA/)
  })
})
