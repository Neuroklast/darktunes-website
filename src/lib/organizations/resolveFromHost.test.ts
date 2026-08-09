import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_ORGANIZATION_SLUG } from '@/lib/organizations/constants'
import { resolveOrganizationSlugFromHost } from '@/lib/organizations/resolveFromHost'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env.PLATFORM_ROOT_DOMAIN = originalEnv.PLATFORM_ROOT_DOMAIN
  process.env.MARKETING_HOSTS = originalEnv.MARKETING_HOSTS
  if (originalEnv.PLATFORM_ROOT_DOMAIN === undefined) delete process.env.PLATFORM_ROOT_DOMAIN
  if (originalEnv.MARKETING_HOSTS === undefined) delete process.env.MARKETING_HOSTS
})

describe('resolveOrganizationSlugFromHost', () => {
  it('maps darkTunes apex to default org', () => {
    const r = resolveOrganizationSlugFromHost('darktunes.com')
    expect(r.organizationSlug).toBe(DEFAULT_ORGANIZATION_SLUG)
    expect(r.isApex).toBe(true)
    expect(r.surface).toBe('tenant')
  })

  it('maps www and localhost to default org', () => {
    expect(resolveOrganizationSlugFromHost('www.darktunes.com').organizationSlug).toBe(
      DEFAULT_ORGANIZATION_SLUG,
    )
    expect(resolveOrganizationSlugFromHost('localhost:3000').organizationSlug).toBe(
      DEFAULT_ORGANIZATION_SLUG,
    )
  })

  it('extracts subdomain on darktunes.app', () => {
    const r = resolveOrganizationSlugFromHost('acme.darktunes.app')
    expect(r.organizationSlug).toBe('acme')
    expect(r.isApex).toBe(false)
    expect(r.subdomain).toBe('acme')
    expect(r.surface).toBe('tenant')
  })

  it('uses PLATFORM_ROOT_DOMAIN for subdomains and marketing apex', () => {
    process.env.PLATFORM_ROOT_DOMAIN = 'labels.example.com'
    expect(resolveOrganizationSlugFromHost('labels.example.com').surface).toBe('marketing')
    expect(resolveOrganizationSlugFromHost('www.labels.example.com').surface).toBe('marketing')
    const r = resolveOrganizationSlugFromHost('acme.labels.example.com')
    expect(r.organizationSlug).toBe('acme')
    expect(r.surface).toBe('tenant')
  })

  it('treats MARKETING_HOSTS as marketing surface', () => {
    process.env.MARKETING_HOSTS = 'get.example.com,www.get.example.com'
    const r = resolveOrganizationSlugFromHost('get.example.com')
    expect(r.surface).toBe('marketing')
    expect(r.organizationSlug).toBe(DEFAULT_ORGANIZATION_SLUG)
  })

  it('handles null host as default tenant', () => {
    const r = resolveOrganizationSlugFromHost(null)
    expect(r.organizationSlug).toBe(DEFAULT_ORGANIZATION_SLUG)
    expect(r.surface).toBe('tenant')
  })
})
