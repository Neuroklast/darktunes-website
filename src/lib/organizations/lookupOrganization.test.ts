import { describe, expect, it } from 'vitest'
import { isSuspendedOrgAllowedPath } from '@/lib/organizations/lookupOrganization'

describe('isSuspendedOrgAllowedPath', () => {
  it('allows billing and auth paths', () => {
    expect(isSuspendedOrgAllowedPath('/login')).toBe(true)
    expect(isSuspendedOrgAllowedPath('/pricing')).toBe(true)
    expect(isSuspendedOrgAllowedPath('/onboarding')).toBe(true)
    expect(isSuspendedOrgAllowedPath('/api/stripe/checkout')).toBe(true)
    expect(isSuspendedOrgAllowedPath('/account/privacy')).toBe(true)
  })

  it('blocks public and dashboard paths', () => {
    expect(isSuspendedOrgAllowedPath('/')).toBe(false)
    expect(isSuspendedOrgAllowedPath('/artists')).toBe(false)
    expect(isSuspendedOrgAllowedPath('/admin')).toBe(false)
    expect(isSuspendedOrgAllowedPath('/portal')).toBe(false)
  })
})
