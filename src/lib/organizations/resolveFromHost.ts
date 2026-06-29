import { DEFAULT_ORGANIZATION_SLUG } from '@/lib/organizations/constants'

/** Platform apex hosts — no tenant subdomain. */
const APEX_HOSTS = new Set([
  'darktunes.com',
  'www.darktunes.com',
  'darktunes.app',
  'www.darktunes.app',
  'localhost',
  '127.0.0.1',
])

export interface HostResolution {
  organizationSlug: string
  isApex: boolean
  subdomain: string | null
}

/**
 * Parses the request host into a tenant slug.
 * label.darktunes.app → demo-label; darktunes.com → default tenant.
 */
export function resolveOrganizationSlugFromHost(hostHeader: string | null): HostResolution {
  const host = (hostHeader ?? '').split(':')[0]?.toLowerCase() ?? ''
  if (!host || APEX_HOSTS.has(host)) {
    return { organizationSlug: DEFAULT_ORGANIZATION_SLUG, isApex: true, subdomain: null }
  }

  const parts = host.split('.')
  if (parts.length >= 3 && (host.endsWith('.darktunes.app') || host.endsWith('.darktunes.com'))) {
    const subdomain = parts[0]
    if (subdomain && subdomain !== 'www') {
      return { organizationSlug: subdomain, isApex: false, subdomain }
    }
  }

  return { organizationSlug: DEFAULT_ORGANIZATION_SLUG, isApex: true, subdomain: null }
}

