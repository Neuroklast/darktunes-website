import { describe, expect, it } from 'vitest'
import { resolveOrganizationSlugFromHost } from '@/lib/organizations/resolveFromHost'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

describe('multi-tenant host resolution', () => {
  it('maps apex host to darktunes slug', () => {
    const result = resolveOrganizationSlugFromHost('darktunes.com')
    expect(result.organizationSlug).toBe('darktunes')
    expect(result.isApex).toBe(true)
  })

  it('maps tenant subdomain to slug', () => {
    const result = resolveOrganizationSlugFromHost('demo-label.darktunes.app')
    expect(result.organizationSlug).toBe('demo-label')
    expect(result.subdomain).toBe('demo-label')
  })

  it('uses distinct sentinel UUIDs for default tenant', () => {
    expect(DEFAULT_ORGANIZATION_ID).toBe('00000000-0000-0000-0000-000000000000')
    expect('11111111-1111-1111-1111-111111111111').not.toBe(DEFAULT_ORGANIZATION_ID)
  })
})