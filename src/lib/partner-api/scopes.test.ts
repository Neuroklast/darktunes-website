import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/errors'
import { requirePartnerScope } from './scopes'

describe('requirePartnerScope', () => {
  it('allows when scope is present', () => {
    expect(() =>
      requirePartnerScope({ organizationId: 'org', apiKeyId: 'key', scopes: ['read'] }, 'read'),
    ).not.toThrow()
  })

  it('allows wildcard scope', () => {
    expect(() =>
      requirePartnerScope({ organizationId: 'org', apiKeyId: 'key', scopes: ['*'] }, 'read'),
    ).not.toThrow()
  })

  it('throws when scope is missing', () => {
    expect(() =>
      requirePartnerScope({ organizationId: 'org', apiKeyId: 'key', scopes: [] }, 'read'),
    ).toThrow(ApiError)
  })
})