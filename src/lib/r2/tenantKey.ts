/**
 * R2 object keys scoped per organization.
 * Dual-read: Org #0 may still use legacy unprefixed keys until migration completes.
 */

import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

export function tenantObjectKey(organizationId: string, ...parts: string[]): string {
  const clean = parts.map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean)
  return ['tenants', organizationId, ...clean].join('/')
}

/** Prefer tenant-prefixed key; for Org #0 also accept legacy key without prefix. */
export function candidateObjectKeys(organizationId: string, legacyKey: string): string[] {
  const prefixed = tenantObjectKey(organizationId, legacyKey)
  if (organizationId === DEFAULT_ORGANIZATION_ID && !legacyKey.startsWith('tenants/')) {
    return [prefixed, legacyKey]
  }
  return [prefixed]
}
