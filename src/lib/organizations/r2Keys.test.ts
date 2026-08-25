import { describe, expect, it } from 'vitest'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import {
  buildTenantObjectKey,
  isTenantPrefixedKey,
  resolveTenantObjectKeyCandidates,
} from './r2Keys'

const ORG_B = '11111111-1111-1111-1111-111111111111'

describe('buildTenantObjectKey', () => {
  it('keeps Org #0 keys flat for zero-downtime expand', () => {
    expect(buildTenantObjectKey(DEFAULT_ORGANIZATION_ID, 'uploads/a.jpg')).toBe('uploads/a.jpg')
    expect(buildTenantObjectKey(DEFAULT_ORGANIZATION_ID, '/uploads/a.jpg')).toBe('uploads/a.jpg')
  })

  it('prefixes non-default orgs with tenants/{id}/', () => {
    expect(buildTenantObjectKey(ORG_B, 'uploads/a.jpg')).toBe(
      `tenants/${ORG_B}/uploads/a.jpg`,
    )
  })

  it('does not double-prefix', () => {
    const once = `tenants/${ORG_B}/uploads/a.jpg`
    expect(buildTenantObjectKey(ORG_B, once)).toBe(once)
  })
})

describe('resolveTenantObjectKeyCandidates', () => {
  it('dual-reads Org #0 legacy + tenants path', () => {
    expect(resolveTenantObjectKeyCandidates(DEFAULT_ORGANIZATION_ID, 'uploads/x')).toEqual([
      'uploads/x',
      `tenants/${DEFAULT_ORGANIZATION_ID}/uploads/x`,
    ])
  })

  it('prefers tenant path for other orgs', () => {
    expect(resolveTenantObjectKeyCandidates(ORG_B, 'uploads/x')).toEqual([
      'uploads/x',
      `tenants/${ORG_B}/uploads/x`,
    ])
  })
})

describe('isTenantPrefixedKey', () => {
  it('detects tenants/ prefix', () => {
    expect(isTenantPrefixedKey(`tenants/${ORG_B}/a`)).toBe(true)
    expect(isTenantPrefixedKey('uploads/a')).toBe(false)
  })
})
