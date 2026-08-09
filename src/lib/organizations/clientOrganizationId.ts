/**
 * Read host organization id from the root layout data attribute (client only).
 */

import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'

export function getClientOrganizationId(): string {
  if (typeof document === 'undefined') return DEFAULT_ORGANIZATION_ID
  const fromDom = document.documentElement.getAttribute('data-organization-id')?.trim()
  return fromDom || DEFAULT_ORGANIZATION_ID
}
