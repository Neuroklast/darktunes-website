/**
 * Host → organization slug resolution (no DB).
 * Ported/extended from PR #417. Full org id lookup belongs in request context (Phase 2).
 */

import { DEFAULT_ORGANIZATION_SLUG } from '@/lib/organizations/constants'

export type AppSurface = 'marketing' | 'platform' | 'tenant'

export interface HostResolution {
  organizationSlug: string
  isApex: boolean
  subdomain: string | null
  surface: AppSurface
}

/** Built-in darkTunes apex hosts → Org #0. */
const BUILTIN_APEX_HOSTS = new Set([
  'darktunes.com',
  'www.darktunes.com',
  'darktunes.app',
  'www.darktunes.app',
  'localhost',
  '127.0.0.1',
])

function parseCsvHosts(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  )
}

function platformRootDomain(): string | null {
  const root = process.env.PLATFORM_ROOT_DOMAIN?.trim().toLowerCase()
  return root || null
}

function marketingHosts(): Set<string> {
  return parseCsvHosts(process.env.MARKETING_HOSTS)
}

function normalizeHost(hostHeader: string | null): string {
  return (hostHeader ?? '').split(':')[0]?.toLowerCase() ?? ''
}

/**
 * Parses the request host into a tenant slug + surface.
 * - Marketing hosts → surface marketing, default slug (no tenant chrome yet)
 * - Subdomain on PLATFORM_ROOT_DOMAIN or *.darktunes.app/com → that slug
 * - darkTunes apex / localhost → Org #0
 */
export function resolveOrganizationSlugFromHost(hostHeader: string | null): HostResolution {
  const host = normalizeHost(hostHeader)

  if (!host) {
    return {
      organizationSlug: DEFAULT_ORGANIZATION_SLUG,
      isApex: true,
      subdomain: null,
      surface: 'tenant',
    }
  }

  if (marketingHosts().has(host)) {
    return {
      organizationSlug: DEFAULT_ORGANIZATION_SLUG,
      isApex: true,
      subdomain: null,
      surface: 'marketing',
    }
  }

  if (BUILTIN_APEX_HOSTS.has(host)) {
    return {
      organizationSlug: DEFAULT_ORGANIZATION_SLUG,
      isApex: true,
      subdomain: null,
      surface: 'tenant',
    }
  }

  const root = platformRootDomain()
  if (root && (host === root || host === `www.${root}`)) {
    return {
      organizationSlug: DEFAULT_ORGANIZATION_SLUG,
      isApex: true,
      subdomain: null,
      surface: 'marketing',
    }
  }

  const parts = host.split('.')
  const onPlatformRoot = root && host.endsWith(`.${root}`) && parts.length >= 2
  const onDarktunes =
    host.endsWith('.darktunes.app') || host.endsWith('.darktunes.com')

  if (parts.length >= 3 && (onPlatformRoot || onDarktunes)) {
    const subdomain = parts[0]
    if (subdomain && subdomain !== 'www') {
      return {
        organizationSlug: subdomain,
        isApex: false,
        subdomain,
        surface: 'tenant',
      }
    }
  }

  // Two-part host under platform root is already handled; custom domains need DB (Phase 2/10).
  return {
    organizationSlug: DEFAULT_ORGANIZATION_SLUG,
    isApex: true,
    subdomain: null,
    surface: 'tenant',
  }
}
