/**
 * Re-export multi-tenant R2 key helpers (SSOT: organizations/r2Keys).
 * Prefer importing from `@/lib/organizations/r2Keys` or `@/lib/organizations`.
 */

export {
  buildTenantObjectKey as tenantObjectKey,
  buildTenantObjectKey,
  resolveTenantObjectKeyCandidates as candidateObjectKeys,
  resolveTenantObjectKeyCandidates,
  isTenantPrefixedKey,
} from '@/lib/organizations/r2Keys'
