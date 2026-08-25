/**
 * R2 object key helpers for multi-tenant isolation.
 *
 * Target layout: `tenants/{organizationId}/…`
 * Expand phase (zero downtime for Org #0 / darkTunes):
 *   - Org #0 writes keep legacy keys (`uploads/…`, `artists/…`) so existing CDN URLs stay valid.
 *   - Other orgs write under `tenants/{organizationId}/…`.
 * Dual-read candidates support later migration of Org #0 keys under the tenants prefix.
 */

import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

function cleanRelativeKey(relativeKey: string): string {
  return relativeKey.replace(/^\/+/, '').replace(/\\/g, '/')
}

/**
 * Build the canonical write key for a new object.
 * Org #0 → legacy flat key (zero downtime). Other orgs → tenants/{id}/…
 */
export function buildTenantObjectKey(organizationId: string, relativeKey: string): string {
  const clean = cleanRelativeKey(relativeKey)
  if (!organizationId || organizationId === DEFAULT_ORGANIZATION_ID) {
    return clean
  }
  if (clean.startsWith(`tenants/${organizationId}/`)) return clean
  return `tenants/${organizationId}/${clean}`
}

/**
 * Keys to try when reading an object (stored key first, then dual-read variants).
 */
export function resolveTenantObjectKeyCandidates(
  organizationId: string,
  storedOrRelativeKey: string,
): string[] {
  const clean = cleanRelativeKey(storedOrRelativeKey)
  const keys: string[] = []
  const push = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k)
  }

  push(clean)

  if (organizationId === DEFAULT_ORGANIZATION_ID) {
    // Org #0 may later live under tenants/ prefix
    if (!clean.startsWith('tenants/')) {
      push(`tenants/${DEFAULT_ORGANIZATION_ID}/${clean}`)
    }
  } else {
    push(buildTenantObjectKey(organizationId, clean))
    // Strip accidental tenants/ prefix for dual-read of mis-stored keys
    const legacy = clean.replace(new RegExp(`^tenants/${organizationId}/`), '')
    if (legacy !== clean) push(legacy)
  }

  return keys
}

/** True when key is already namespaced under tenants/. */
export function isTenantPrefixedKey(key: string): boolean {
  return cleanRelativeKey(key).startsWith('tenants/')
}
