import { describe, it, expect } from 'vitest'
import { resolveOrganizationSlugFromHost } from './resolveFromHost'

describe('resolveOrganizationSlugFromHost', () => {
  it('returns default slug for apex host', () => {
    const result = resolveOrganizationSlugFromHost('darktunes.com')
    expect(result.isApex).toBe(true)
    expect(result.organizationSlug).toBe('darktunes')
  })

  it('parses tenant subdomain', () => {
    const result = resolveOrganizationSlugFromHost('demo-label.darktunes.app')
    expect(result.isApex).toBe(false)
    expect(result.organizationSlug).toBe('demo-label')
    expect(result.subdomain).toBe('demo-label')
  })

  it('handles localhost as apex', () => {
    const result = resolveOrganizationSlugFromHost('localhost:3000')
    expect(result.isApex).toBe(true)
    expect(result.organizationSlug).toBe('darktunes')
  })
})