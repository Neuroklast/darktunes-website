/**
 * ISR / Data Cache tags must be organization-scoped to prevent cross-tenant bleed.
 */

export function orgTag(organizationId: string, tag: string): string {
  return `o:${organizationId}:${tag}`
}

export function orgEntityTag(
  organizationId: string,
  kind: 'artist' | 'release' | 'news',
  idOrSlug: string,
): string {
  return `o:${organizationId}:${kind}-${idOrSlug}`
}
